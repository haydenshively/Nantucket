require("./setup");

const child_process = require("child_process");
const winston = require("winston");

// src
const Database = require("./database");
// src.messaging
const Candidate = require("./messaging/candidate");
const Channel = require("./messaging/channel");
const Message = require("./messaging/message");
const Oracle = require("./messaging/oracle");
// src.network.web
const Reporter = require("./network/web/coinbase/reporter");
// src.network.webthree
const Tokens = require("./network/webthree/compound/ctoken");
const PriceOracle = require("./network/webthree/compound/priceoracle");

console.log(`Master ${process.pid} is running`);

// MARK: LOAD AND VERIFY CONFIG.JSON --------------------------------
if (process.argv.length < 3) {
  console.error("Please pass path to config*.json");
  process.exit();
}
const config = require(process.argv[2]);
const numCPUs = require("os").cpus().length;
if (numCPUs < config.txManagers.length + config.liquidators.length) {
  console.error("Nantucket requires more CPU cores for this config");
  process.exit();
}

// MARK: SETUP TRANSACTION MANAGERS ---------------------------------
let txManagers = {};
for (let key in config.txManagers) {
  const txManager = config.txManagers[key];
  txManagers[key] = child_process.fork(
    "start_txmanager.js",
    [
      process.argv[2],
      txManager.envKeyAddress,
      txManager.envKeySecret,
      txManager.interval,
      txManager.maxFee_Eth,
      // logging
      config.logging.ipc["Oracles>Set"],
      config.logging.ipc["Candidates>Liquidate"],
      config.logging.ipc["Candidates>LiquidateWithPriceUpdate"],
      config.logging.ipc["Messages>CheckCandidatesLiquidityComplete"]
    ],
    { cwd: "src" }
  );
}

// MARK: SETUP CANDIDATE WORKERS ------------------------------------
function passthrough(channel, action, from, to) {
  channel = Channel(channel);
  channel.on(action, msg => channel.broadcast(action, msg.msg(), to), from);
}

let workers = [];
for (let liquidator of config.liquidators) {
  const worker = child_process.fork(
    "start_worker.js",
    [
      process.argv[2],
      liquidator.minRevenue,
      liquidator.maxRevenue,
      liquidator.maxHealth,
      liquidator.numCandidates,
      // logging
      config.logging.ipc["Oracles>Set"],
      config.logging.ipc["Messages>UpdateCandidates"],
      config.logging.ipc["Messages>CheckCandidatesLiquidity"],
      config.logging.ipc["Messages>MissedOpportunity"]
    ],
    { cwd: "src" }
  );
  const txManager = txManagers[liquidator.txManager];
  passthrough(Candidate, "Liquidate", worker, txManager);
  passthrough(Candidate, "LiquidateWithPriceUpdate", worker, txManager);
  passthrough(Message, "CheckCandidatesLiquidityComplete", worker, txManager);

  workers.push({
    process: worker,
    txManager: txManager
  });
}

// MARK: SETUP MASTER DATABASE AND BLOCKCHAIN WORKER ----------------
function setOracles() {
  workers.forEach(w =>
    Channel(Oracle).broadcast("Set", reporter.msg(), w.process)
  );
  for (let key in txManagers)
    Channel(Oracle).broadcast("Set", reporter.msg(), txManagers[key]);

  // logging
  if (config.logging.ipc["Oracles>Set"])
    winston.info("🏷 *Oracles* | Broadcasted 'Set'");
}

function checkLiquidities() {
  workers.forEach(w =>
    new Message().broadcast("CheckCandidatesLiquidity", w.process)
  );

  // logging
  if (config.logging.ipc["Messages>CheckCandidatesLiquidity"])
    winston.info("📢 *Messages* | Broadcasted 'Check Candidates Liquidity'");
}

function updateCandidates() {
  workers.forEach(w => new Message().broadcast("UpdateCandidates", w.process));

  // logging
  if (config.logging.ipc["Messages>UpdateCandidates"])
    winston.info("📢 *Messages* | Broadcasted 'Update Candidates'");
}

function notifyNewBlock() {
  for (let key in txManagers)
    new Message().broadcast("NewBlock", txManagers[key]);
}

function notifyMissedOpportunity(event) {
  workers.forEach(w =>
    new Message({ address: event.borrower }).broadcast(
      "MissedOpportunity",
      w.process
    )
  );
  for (let key in txManagers)
    new Message({ address: event.borrower }).broadcast(
      "MissedOpportunity",
      txManagers[key]
    );

  // logging
  if (config.logging.ipc["Messages>MissedOpportunity"])
    winston.info("📢 *Messages* | Broadcasted 'Missed Opportunity'");
}

// pull from cTokenService and AccountService
const database = new Database();
const handle1 = setInterval(
  database.pullFromCTokenService.bind(database),
  config.fetching.cTokenServiceInterval
);
if (config.fetching.cTokenServiceInterval === 0) clearInterval(handle1);
const handle2 = setInterval(async () => {
  await database.pullFromAccountService.bind(database)();
  updateCandidates();
}, config.fetching.accountServiceInterval);
if (config.fetching.accountServiceInterval === 0) clearInterval(handle2);

// pull from Coinbase reporter
const reporter = Reporter.mainnet;
const handle3 = setInterval(async () => {
  const didUpdate = await reporter.fetch.bind(reporter)();
  if (!didUpdate) return;

  setOracles();
  checkLiquidities();
}, config.fetching.coinbaseReporter);

// watch for on-chain price updates
PriceOracle.mainnet.subscribeToLogEvent(
  web3,
  "AnchorPriceUpdated",
  (err, event) => {
    if (err) return;
    reporter.respondToNewAnchor.bind(reporter)(event);
  }
);
PriceOracle.mainnet.subscribeToLogEvent(
  web3,
  "PriceUpdated",
  (err, event) => {
    if (err) return;
    reporter.respondToPost.bind(reporter)(event);
  }
)

// watch for new blocks
web3.eth.subscribe("newBlockHeaders", (err, block) => {
  if (err) {
    winston.error("🚨 *Block Headers* | " + String(err));
    return;
  }
  notifyNewBlock();
  checkLiquidities();
  if (!(block.number % 240))
    winston.info(`☑️ *Block Headers* | ${block.number}`);
});

// watch for new liquidations
for (let symbol in Tokens.mainnet) {
  const token = Tokens.mainnet[symbol];
  token.subscribeToLogEvent(web3, "LiquidateBorrow", (err, event) => {
    if (err) return;
    notifyMissedOpportunity(event);
    const addr = event.borrower;
    winston.warn(
      `🚨 *Liquidation* | ${event.liquidator.slice(
        0,
        6
      )} seized collateral from ${addr.slice(0, 6)}`
    );
  });
}


process.on("SIGINT", () => {
  console.log("\nCaught interrupt signal");

  clearInterval(handle1);
  clearInterval(handle2);
  clearInterval(handle3);

  for (key in txManagers) txManagers[key].kill("SIGINT");
  workers.forEach(w => w.process.kill("SIGINT"));

  web3.eth.clearSubscriptions();
  try {
    web3.currentProvider.connection.close();
  } catch {
    web3.currentProvider.connection.destroy();
  }
  database.stop();
  process.exit();
});

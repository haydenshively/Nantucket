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

if (process.argv.length < 3) {
  console.log("Please pass path to config.json");
  process.exit();
}
const config = require(process.argv[2]);

console.log(`Master ${process.pid} is running`);

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
      txManager.envKeyAddress,
      txManager.envKeySecret,
      txManager.interval,
      txManager.maxFee_Eth
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
      liquidator.minRevenue,
      liquidator.maxRevenue,
      liquidator.maxHealth,
      liquidator.numCandidates
    ],
    { cwd: "src" }
  );
  const txManager = txManagers[liquidator.txManager];
  passthrough(Candidate, "Liquidate", worker, txManager);
  passthrough(Candidate, "LiquidateWithPriceUpdate", worker, txManager);

  workers.push({
    process: worker,
    txManager: txManager
  });
}

// MARK: SETUP MASTER DATABASE AND BLOCKCHAIN WORKER ----------------
function setOracles() {
  workers.forEach(w => Channel(Oracle).broadcast("Set", reporter.msg(), w.process));
  for (let key in txManagers)
    Channel(Oracle).broadcast("Set", reporter.msg(), txManagers[key]);
}

function checkLiquidities() {
  workers.forEach(w => new Message().broadcast("CheckCandidatesLiquidity", w.process));
}

function updateCandidates() {
  workers.forEach(w => new Message().broadcast("UpdateCandidates", w.process));
}

function notifyNewBlock() {
  for (let key in txManagers)
    new Message().broadcast("NewBlock", txManagers[key]);
}

// pull from cTokenService and AccountService
const database = new Database();
const handle1 = setInterval(
  database.pullFromCTokenService.bind(database),
  6 * 60 * 1000
);
const handle2 = setInterval(async () => {
  await database.pullFromAccountService.bind(database)();
  updateCandidates();
}, 9 * 60 * 1000);

// pull from Coinbase reporter
const reporter = Reporter.mainnet;
const handle3 = setInterval(async () => {
  const addrToCheck = "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";
  const before = reporter.getPrice(addrToCheck);
  await reporter.fetch.bind(reporter)();
  if (reporter.getPrice(addrToCheck) === before) return;

  setOracles();
  checkLiquidities();

  winston.info("🏷 *Prices* | Updated from Coinbase");
}, 500);

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

// log losses for debugging purposes
const Tokens = require("./network/webthree/compound/ctoken");
for (let symbol in Tokens.mainnet) {
  const token = Tokens.mainnet[symbol];
  token.subscribeToLogEvent("LiquidateBorrow", (err, event) => {
    if (err) return;
    const addr = event.borrower;
    winston.warn(
      `🚨 *Liquidate Event* | Didn't liquidate ${addr.slice(
        0,
        6
      )} due to bad logic (or gas war).`
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

  database.stop();
  web3.eth.clearSubscriptions();
  try {
    web3.currentProvider.connection.close();
  } catch {
    web3.currentProvider.connection.destroy();
  }

  process.exit();
});

// winston.log(
//   "info",
//   `🐳 *Proposal ${i.label}* | Liquidating for $${profit.toFixed(
//     2
//   )} profit at block ${blockNumber}`
// );

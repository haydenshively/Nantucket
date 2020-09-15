import child_process from "child_process";
import winston from "winston";
// src
import Database from "./database";
// src.messaging
import Candidate from "./messaging/candidate";
import Channel from "./messaging/channel";
import Message from "./messaging/message";
import Oracle from "./messaging/oracle";
// src.network.web
import { mainnet as reporterMainnet } from "./network/web/coinbase/reporter";
// src.network.webthree
import Tokens, { CTokenType } from "./network/webthree/compound/ctoken";
import { EthNet } from "./network/webthree/ethnet";
// Run the setup script
import { web3 } from "./setup";

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
    { cwd: "build" }
  );
}

// MARK: SETUP CANDIDATE WORKERS ------------------------------------
function passthrough(channel, action, from, to) {
  channel = Channel.for(channel);
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
    { cwd: "build" }
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
    Channel.for(Oracle).broadcast("Set", reporter.msg(), w.process)
  );
  for (let key in txManagers)
    Channel.for(Oracle).broadcast("Set", reporter.msg(), txManagers[key]);

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

  // logging
  if (config.logging.ipc["Messages>MissedOpportunity"])
    winston.info("📢 *Messages* | Broadcasted 'Missed Opportunity'");
}

// pull from cTokenService and AccountService
const database = new Database(web3);
const handle1 = setInterval(
  database.pullFromCTokenService.bind(database),
  config.fetching.cTokenServiceInterval
);
const handle2 = setInterval(async () => {
  await database.pullFromAccountService.bind(database)();
  updateCandidates();
}, config.fetching.accountServiceInterval);

// pull from Coinbase reporter
const reporter = reporterMainnet;
const handle3 = setInterval(async () => {
  // assume that if any prices change, they all change
  // (as such it doesn't matter which token we check)
  // --> randomly select from a subset of tokens
  const symToCheck = ["ETH", "BTC", "BAT", "DAI"][(4 * Math.random()) << 0];
  const before = reporter.getPriceSymbol(symToCheck);
  await reporter.fetch.bind(reporter)();
  if (reporter.getPriceSymbol(symToCheck) === before) return;

  setOracles();
  checkLiquidities();
}, config.fetching.coinbaseReporter);

// watch for new blocks
// @ts-ignore
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
for (let symbol in CTokenType) {
  const token = Tokens.forSymbol(CTokenType[symbol as keyof typeof CTokenType]).forNet(EthNet.mainnet);
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

  for (let key in txManagers) txManagers[key].kill("SIGINT");
  workers.forEach(w => w.process.kill("SIGINT"));

  // @ts-ignore
  web3.eth.clearSubscriptions();
  try {
    web3.currentProvider.connection.close();
  } catch {
    // @ts-ignore
    web3.currentProvider.connection.destroy();
  }
  database.stop();
  process.exit();
});

// winston.log(
//   "info",
//   `🐳 *Proposal ${i.label}* | Liquidating for $${profit.toFixed(
//     2
//   )} profit at block ${blockNumber}`
// );
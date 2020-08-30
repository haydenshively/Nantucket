require("./setup");
const winston = require("winston");

// src.messaging
const Channel = require("./messaging/channel");
const Message = require("./messaging/message");
const Oracle = require("./messaging/oracle");

if (process.argv.length < 7) {
  console.log("Worker process requires config.json and 4 arguments");
  process.exit();
}
console.log(`Worker ${process.pid} is running`);

const Worker = require("./worker");
const worker = new Worker(
  Number(process.argv[3]),
  process.argv[4] == "null" ? null : Number(process.argv[3]),
  process.argv[5] == "null" ? null : Number(process.argv[4]),
  Number(process.argv[6])
);

// Add logging handlers *after* initializing the worker so that they don't
// clog up the list of IPC hooks. process.on(...) handlers are called
// in the order they're added
if (process.argv.length === 10) {
  const pid = process.pid;
  if (process.argv[7] === "true")
    Channel(Oracle).on("Set", _ =>
      winston.info(`🏷 *Oracles* | ${pid} got 'Set'`)
    );
  if (process.argv[8] === "true")
    Channel(Message).on("UpdateCandidates", _ =>
      winston.info(`📢 *Messages* | ${pid} got 'Update Candidates'`)
    );
  if (process.argv[9] === "true")
    Channel(Message).on("CheckCandidatesLiquidity", _ =>
      winston.info(`📢 *Messages* | ${pid} got 'Check Candidates Liquidity'`)
    );
}

process.on("SIGINT", code => {
  web3.eth.clearSubscriptions();
  try {
    web3.currentProvider.connection.close();
  } catch {
    web3.currentProvider.connection.destroy();
  }
  worker.stop();

  console.log(`Worker ${process.pid} has exited cleanly`);
  process.exit();
});

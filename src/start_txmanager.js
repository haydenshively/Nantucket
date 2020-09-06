require("./setup");
const winston = require("winston");

// src.messaging
const Candidate = require("./messaging/candidate");
const Channel = require("./messaging/channel");
const Message = require("./messaging/message");
const Oracle = require("./messaging/oracle");

if (process.argv.length < 7) {
  console.log("TxManager process requires config.json and 4 arguments");
  process.exit();
}
console.log(`TxManager ${process.pid} is running`);

const TxManager = require("./network/webthree/txmanager");
const txManager = new TxManager(
  web3,
  String(process.argv[3]),
  String(process.argv[4]),
  Number(process.argv[5]),
  Number(process.argv[6])
);

txManager.init();

// Add logging handlers *after* initializing the txManager so that they don't
// clog up the list of IPC hooks. process.on(...) handlers are called
// in the order they're added
if (process.argv.length === 11) {
  const pid = process.pid;
  if (process.argv[7] === "true")
    Channel(Oracle).on("Set", _ =>
      winston.info(`🏷 *Oracles* | ${pid} got 'Set'`)
    );
  if (process.argv[8] === "true")
    Channel(Candidate).on("Liquidate", _ =>
      winston.info(`🐳 *Candidates* | ${pid} got 'Liquidate'`)
    );
  if (process.argv[9] === "true")
    Channel(Candidate).on("LiquidateWithPriceUpdate", _ =>
      winston.info(`🐳 *Candidates* | ${pid} got 'Liquidate With Price Update'`)
    );
  if (process.argv[10] === "true")
    Channel(Message).on("CheckCandidatesLiquidityComplete", msg =>
      winston.info(
        `📢 *Messages* | ${pid} got 'Check Candidates Liquidity Complete' (after ${msg.__data.time} ms)`
      )
    );
}

process.on("SIGINT", code => {
  web3.eth.clearSubscriptions();
  try {
    web3.currentProvider.connection.close();
  } catch {
    web3.currentProvider.connection.destroy();
  }
  txManager.stop();

  console.log(`TxManager ${process.pid} has exited cleanly`);
  process.exit();
});

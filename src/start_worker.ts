// src.messaging
import Channel from "./messaging/channel";
import Oracle from "./messaging/oracle";
import Message from "./messaging/message";
import winston from "winston";

// Run the setup script
import { web3 } from "./setup";

if (process.argv.length < 7) {
  console.log("Worker process requires config.json and 4 arguments");
  process.exit();
}
console.log(`Worker ${process.pid} is running`);

const Worker = require("./worker");
const worker = new Worker(
  web3,
  Number(process.argv[3]),
  process.argv[4] == "null" ? null : Number(process.argv[4]),
  process.argv[5] == "null" ? null : Number(process.argv[5]),
  Number(process.argv[6])
);

// Add logging handlers *after* initializing the worker so that they don't
// clog up the list of IPC hooks. process.on(...) handlers are called
// in the order they're added
if (process.argv.length === 11) {
  const pid = process.pid;
  if (process.argv[7] === "true")
    Channel.for(Oracle).on("Set", _ =>
      winston.info(`🏷 *Oracles* | ${pid} got 'Set'`)
    );
  if (process.argv[8] === "true")
    Channel.for(Message).on("UpdateCandidates", _ =>
      winston.info(`📢 *Messages* | ${pid} got 'Update Candidates'`)
    );
  if (process.argv[9] === "true")
    Channel.for(Message).on("CheckCandidatesLiquidity", _ =>
      winston.info(`📢 *Messages* | ${pid} got 'Check Candidates Liquidity'`)
    );
  if (process.argv[10] === "true")
    Channel.for(Message).on("MissedOpportunity", _ =>
      winston.info(`📢 *Messages* | ${pid} got 'Missed Opportunity'`)
    );
}

process.on("SIGINT", code => {
  // @ts-ignore
  web3.eth.clearSubscriptions();
  try {
    web3.currentProvider.connection.close();
  } catch {
    // @ts-ignore
    web3.currentProvider.connection.destroy();
  }
  worker.stop();

  console.log(`Worker ${process.pid} has exited cleanly`);
  process.exit();
});

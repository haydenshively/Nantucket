require("dotenv").config();

const Web3 = require("web3");
if (process.env.WEB3_PROVIDER.endsWith(".ipc")) {
  net = require("net");
  global.web3 = new Web3(process.env.WEB3_PROVIDER, net);
} else {
  global.web3 = new Web3(process.env.WEB3_PROVIDER);
}

const Main = require("./main");
new Main();

setInterval(Main.pullFromCTokenService, 6 * 60 * 1000);
setInterval(Main.pullFromAccountService, 15 * 60 * 1000, 15, 4);
setInterval(Main.updateLiquidationCandidates, 5 * 60 * 1000);

web3.eth.subscribe("newBlockHeaders", (err, block) => {
  if (err) {
    console.log(error);
    return;
  }

  console.log(block.number);
  Main.onNewBlock();
});

process.on("SIGINT", () => {
  console.log("\nCaught interrupt signal");

  web3.eth.clearSubscriptions();
  Main.shared.end();
  process.exit();
});

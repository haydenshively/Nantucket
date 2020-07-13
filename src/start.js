require("dotenv").config();

const Web3 = require("web3");
if (process.env.WEB3_PROVIDER.endsWith(".ipc")) {
  net = require("net");
  global.web3 = new Web3(process.env.WEB3_PROVIDER, net);
} else {
  global.web3 = new Web3(process.env.WEB3_PROVIDER);
}

const Main = require("./main");
new Main(1.25);

// Run immediately
Main.updateLiquidationCandidates();

// Schedule to run on timers
setInterval(Main.pullFromCTokenService, 6 * 60 * 1000);
setInterval(Main.pullFromAccountService, 12 * 60 * 1000, 12, 4);
setInterval(Main.updateLiquidationCandidates, 5 * 60 * 1000);

// Schedule to run every block
web3.eth.subscribe("newBlockHeaders", (err, block) => {
  if (err) {
    console.log(error);
    return;
  }

  if (block.number % 1000 == 0) console.log(block.number);
  
  Main.onNewBlock();
});

process.on("SIGINT", () => {
  console.log("\nCaught interrupt signal");

  web3.eth.clearSubscriptions();
  Main.shared.end();
  process.exit();
});

const Tokens = require("./network/webthree/compound/ctoken");
for (let symbol in Tokens.mainnet) {
  const token = Tokens.mainnet[symbol];
  token.subscribeToLogEvent("LiquidateBorrow", (err, event) => {
    if (err) {
      console.log(error);
      return;
    }

    const target = event.borrower;
    const targets = Main.shared._liquidationTargets.map(t => "0x" + t.address);

    if (!targets.includes(target)) {
      console.log("Didn't liquidate " + target.slice(6) + "because they weren't in the candidates list");
    } else {
      console.log("Some sort of logic was wrong for:")
      console.log(event);
    }
  });
}

require("./setup");

if (process.argv.length < 6) {
  console.log("TxManager process requires 4 arguments");
  process.exit();
}
console.log(`TxManager ${process.pid} is running`);

const TxManager = require("./network/webthree/txmanager");
const txManager = new TxManager(
  String(process.argv[2]),
  String(process.argv[3]),
  Number(process.argv[4]),
  Number(process.argv[5])
);

txManager.init();

process.on("SIGINT", code => {
  web3.eth.clearSubscriptions();
  txManager.stop();

  console.log(`TxManager ${process.pid} has exited cleanly`);
  process.exit();
});

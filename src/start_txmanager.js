require("./setup");

if (process.argv.length < 6) {
  console.log("TxManager process requires 4 arguments");
  process.exit();
}
console.log(`TxManager ${process.pid} is running`);

const TxManager = require("./network/webthree/txmanager");
const txManager = new TxManager(
  web3s.mainnet[0],// TODO should come from config.json
  String(process.argv[2]),
  String(process.argv[3]),
  Number(process.argv[4]),
  Number(process.argv[5])
);

txManager.init();

process.on("SIGINT", code => {
  for (let net in web3s) {
    for (let provider of web3s[net]) {
      provider.eth.clearSubscriptions();
      try {
        provider.currentProvider.connection.close();
      } catch {
        provider.currentProvider.connection.destroy();
      }
    }
  }
  txManager.stop();

  console.log(`TxManager ${process.pid} has exited cleanly`);
  process.exit();
});

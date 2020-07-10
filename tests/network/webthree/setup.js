require("dotenv").config();

const Web3 = require("web3");
if (process.env.WEB3_PROVIDER_TEST.endsWith(".ipc")) {
  net = require("net");
  global.web3 = new Web3(process.env.WEB3_PROVIDER_TEST, net);
} else {
  global.web3 = new Web3(process.env.WEB3_PROVIDER_TEST);
}

after(() => {
  try {
    web3.currentProvider.connection.close();
  } catch {
    web3.currentProvider.connection.destroy();
  }
});

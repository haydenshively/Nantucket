require("dotenv").config();
const config = require("../config.json");

const BORROWERS = [
  "0xf5bbe12440308b20c16f0ace1c86c9109a397d8c",
  "0x7ed66698739139c1a9e945c249dcff6431c2dccf"
];
const REPAY = [
  "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
  "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643"
];
const SEIZE = [
  "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e",
  "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5"
];

// configure web3
const { MultiSendProvider } = require("../src/network/webthree/providers");
const web3 = new MultiSendProvider(
  config.network.name,
  config.network.providers
);

// configure FlashLiquidator stuff
const Tx = require("ethereumjs-tx").Transaction;
const Web3Utils = require("web3-utils");
const FlashLiquidator = require("../src/network/webthree/goldenage/flashliquidator");
const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

// create method to confirm/cancel transaction
const readline = require("readline");
function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve =>
    rl.question(query, ans => {
      rl.close();
      resolve(ans);
    })
  );
}

(async () => {
  try {
    const gasPrice = Big(await web3.eth.getGasPrice());
    const nonce = await web3.eth.getTransactionCount(
      process.env.ACCOUNT_ADDRESS_TEST
    );
    const tx = FlashLiquidator.mainnet.liquidateMany(
      BORROWERS,
      REPAY,
      SEIZE,
      gasPrice
    );
    tx.from = process.env.ACCOUNT_ADDRESS_TEST;
    tx.nonce = Web3Utils.toHex(nonce);
    tx.gasLimit = Web3Utils.toHex(2100000 * BORROWERS.length);
    tx.gasPrice = Web3Utils.toHex(tx.gasPrice.toFixed(0));

    let signedTx = new Tx(tx);
    signedTx.sign(Buffer.from(process.env.ACCOUNT_SECRET_TEST, "hex"));
    signedTx = "0x" + signedTx.serialize().toString("hex");

    console.log(tx);
    const ans = await askQuestion(
      "Are you sure you want to send this transaction on mainnet? (Y/N) "
    );
    if (ans === "Y") await web3.eth.sendSignedTransaction(signedTx);
  } finally {
    web3.eth.clearSubscriptions();
    try {
      web3.currentProvider.connection.close();
    } catch {
      web3.currentProvider.connection.destroy();
    }
  }
})().catch(err => console.log(err.stack));

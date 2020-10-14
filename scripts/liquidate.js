require("dotenv").config();
const config = require("../config.json");

const BORROWERS = [
  // Working
  "0x6e197190de43166839665157274ee695456259f7",
  "0x08ed3c17e5df89297402b717d1257fb125d7156e",
  "0x3c894879e16a2c442ccafbbe487568b41fed299f",
  "0x5761ab177fc7d38dcce87950111b34825217b54b",
  "0xc78f3ea41dd17d51113045c343e3a3ac5ae895ba",
  "0xbca105cbe6dab19664ac23d9e155be4da24ffc4a",
  // Broken
  "0xd6fb45d90ce9f0fdd655c2b2257172a2b088ef2b",
];
const REPAY = [
  // Working
  "0xf5dce57282a584d2746faf1593d3121fcac444dc",
  "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
  "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9",
  "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
  "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4",
  "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9",
  // Broken
  "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9"
];
const SEIZE = [
  // Working
  "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
  "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e",
  "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
  "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e",
  "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e",
  "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e",
  // Broken
  "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643"
];

// configure web3
const { MultiSendProvider } = require("../src/network/webthree/providers");
const web3 = new MultiSendProvider(
  config.network.name,
  config.network.providers
);

// configure Liquidator stuff
const Tx = require("ethereumjs-tx").Transaction;
const Web3Utils = require("web3-utils");
const Liquidator = require("../src/network/webthree/goldenage/liquidator");
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
    const tx = Liquidator.mainnet.liquidateMany(
      BORROWERS,
      REPAY,
      SEIZE,
      gasPrice
    );
    tx.from = process.env.ACCOUNT_ADDRESS_TEST;
    tx.nonce = Web3Utils.toHex(nonce);
    tx.gasLimit = Web3Utils.toHex(1500000 * BORROWERS.length);
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

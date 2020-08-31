const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Tx = require("ethereumjs-tx").Transaction;
const Web3Utils = require("web3-utils");

const FlashLiquidator = require("../../../../src/network/webthree/goldenage/flashliquidator");
const Reporter = require("../../../../src/network/web/coinbase/reporter");

describe("network/webthree/goldenage || FlashLiquidator Test", () => {
  xit("should accept empty borrower list", () => {
    return web3.ropsten.eth.getGasPrice().then(gasPrice => {
      gasPrice = Big(gasPrice).times(1.2);

      return web3.ropsten.eth
        .getTransactionCount(process.env.ACCOUNT_ADDRESS_TEST)
        .then(nonce => {
          const tx = FlashLiquidator.ropsten.liquidateMany(
            [],
            [],
            [],
            gasPrice
          );
          tx.from = process.env.ACCOUNT_ADDRESS_TEST;
          tx.nonce = Web3Utils.toHex(nonce);
          tx.gasLimit = Web3Utils.toHex("1000000");
          tx.gasPrice = Web3Utils.toHex(tx.gasPrice.toFixed(0));

          let signedTx = new Tx(tx, {
            chain: "ropsten",
            hardfork: "petersburg"
          });
          signedTx.sign(Buffer.from(process.env.ACCOUNT_SECRET_TEST, "hex"));
          signedTx = "0x" + signedTx.serialize().toString("hex");

          return web3.ropsten.eth.sendSignedTransaction(signedTx);
        });
    });
  }).timeout(120000);

  it("should update price", () => {
    return web3.ropsten.eth.getGasPrice().then(gasPrice => {
      gasPrice = Big(gasPrice).times(1.2);

      return web3.ropsten.eth
        .getTransactionCount(process.env.ACCOUNT_ADDRESS_TEST)
        .then(nonce => {
          return Reporter.mainnet.fetch().then(() => {
            const postableData = Reporter.mainnet.postableData();
            const tx = FlashLiquidator.ropsten.liquidateManyWithPriceUpdate(
              postableData[0],
              postableData[1],
              postableData[2],
              [],
              [],
              [],
              gasPrice
            );
            tx.from = process.env.ACCOUNT_ADDRESS_TEST;
            tx.nonce = Web3Utils.toHex(nonce);
            tx.gasLimit = Web3Utils.toHex("1000000");
            tx.gasPrice = Web3Utils.toHex(tx.gasPrice.toFixed(0));

            let signedTx = new Tx(tx, {
              chain: "ropsten",
              hardfork: "petersburg"
            });
            signedTx.sign(Buffer.from(process.env.ACCOUNT_SECRET_TEST, "hex"));
            signedTx = "0x" + signedTx.serialize().toString("hex");

            return web3.ropsten.eth.sendSignedTransaction(signedTx);
          });
        });
    });
  }).timeout(120000);
});

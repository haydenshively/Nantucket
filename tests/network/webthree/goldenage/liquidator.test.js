const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Tx = require("ethereumjs-tx").Transaction;
const Web3Utils = require("web3-utils");

const Liquidator = require("../../../../src/network/webthree/goldenage/liquidator");
const Reporter = require("../../../../src/network/web/coinbase/reporter");

describe("network/webthree/goldenage || Liquidator Test", () => {
  it("should accept bad borrower list", () => {
    return web3.mainnet.eth.getGasPrice().then(gasPrice => {
      gasPrice = Big(gasPrice).times(1.2);

      return web3.mainnet.eth
        .getTransactionCount(process.env.ACCOUNT_ADDRESS_TEST)
        .then(nonce => {
          const tx = Liquidator.mainnet.liquidateSN(
            ["0x7e3A0C2300175FF712742c21F36216e9fb63b487"],
            ["0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e"],
            ["0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5"],
            gasPrice,
            true // USE CHI!!!
          );
          tx.from = process.env.ACCOUNT_ADDRESS_TEST;
          tx.nonce = Web3Utils.toHex(nonce);
          tx.gasPrice = Web3Utils.toHex(tx.gasPrice.toFixed(0));

          let signedTx = new Tx(tx, {
            chain: "mainnet",
            hardfork: "petersburg"
          });
          signedTx.sign(Buffer.from(process.env.ACCOUNT_SECRET_TEST, "hex"));
          signedTx = "0x" + signedTx.serialize().toString("hex");

          return web3.mainnet.eth.sendSignedTransaction(signedTx);
        });
    });
  }).timeout(120000);

  it("should update price", () => {
    return web3.mainnet.eth.getGasPrice().then(gasPrice => {
      gasPrice = Big(gasPrice).times(2.0);

      return web3.mainnet.eth
        .getTransactionCount(process.env.ACCOUNT_ADDRESS_TEST)
        .then(nonce => {
          return Reporter.mainnet.fetch().then(() => {
            const postableData = Reporter.mainnet.postableData();
            const tx = Liquidator.ropsten.liquidateSNWithPrice(
              postableData[0],
              postableData[1],
              postableData[2],
              ["0x7e3A0C2300175FF712742c21F36216e9fb63b487"],
              ["0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e"],
              ["0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5"],
              gasPrice,
              true // USE CHI!!!
            );
            tx.from = process.env.ACCOUNT_ADDRESS_TEST;
            tx.nonce = Web3Utils.toHex(nonce);
            tx.gasPrice = Web3Utils.toHex(tx.gasPrice.toFixed(0));

            let signedTx = new Tx(tx, {
              chain: "mainnet",
              hardfork: "petersburg"
            });
            signedTx.sign(Buffer.from(process.env.ACCOUNT_SECRET_TEST, "hex"));
            signedTx = "0x" + signedTx.serialize().toString("hex");

            return web3.mainnet.eth.sendSignedTransaction(signedTx);
          });
        });
    });
  }).timeout(120000);
});

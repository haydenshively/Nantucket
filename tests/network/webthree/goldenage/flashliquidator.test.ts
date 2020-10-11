import Big from "../../../../src/big"

import { Transaction as Tx } from "ethereumjs-tx";
import Web3Utils from "web3-utils";
import FlashLiquidator from "../../../../src/network/webthree/goldenage/flashliquidator";
import { mainnet as ReporterMainnet } from "../../../../src/network/web/coinbase/reporter";
import { EthNet } from "../../../../src/network/webthree/ethnet";

describe("network/webthree/goldenage || FlashLiquidator Test", () => {
  xit("should accept empty borrower list", () => {
    // @ts-ignore
    return global.web3.ropsten.eth.getGasPrice().then(gasPrice => {
      gasPrice = Big(gasPrice).times(1.2);

      // @ts-ignore
      return global.web3.ropsten.eth
        .getTransactionCount(process.env.ACCOUNT_ADDRESS_TEST)
        .then(nonce => {
          const tx = FlashLiquidator.forNet(EthNet.ropsten).liquidateMany(
            [],
            [],
            [],
            gasPrice
          );
          // @ts-ignore
          tx.from = process.env.ACCOUNT_ADDRESS_TEST;
          // @ts-ignore
          tx.nonce = Web3Utils.toHex(nonce);
          tx.gasLimit = Web3Utils.toHex("1000000");
          tx.gasPrice = Web3Utils.toHex(tx.gasPrice.toFixed(0));

          let signedTx = new Tx(tx, {
            chain: "ropsten",
            hardfork: "petersburg"
          });
          signedTx.sign(Buffer.from(process.env.ACCOUNT_SECRET_TEST, "hex"));
          // @ts-ignore
          signedTx = "0x" + signedTx.serialize().toString("hex");
          // @ts-ignore
          return global.web3.ropsten.eth.sendSignedTransaction(signedTx);
        });
    });
  }).timeout(120000);

  it("should update price", () => {
    // @ts-ignore
    return global.web3.ropsten.eth.getGasPrice().then(gasPrice => {
      gasPrice = Big(gasPrice).times(2.0);
      // @ts-ignore
      return global.web3.ropsten.eth
        .getTransactionCount(process.env.ACCOUNT_ADDRESS_TEST)
        .then(nonce => {
          return ReporterMainnet.fetch().then(() => {
            const postableData = ReporterMainnet.postableData();
            const tx = FlashLiquidator.forNet(EthNet.ropsten).liquidateManyWithPriceUpdate(
              postableData[0],
              postableData[1],
              postableData[2],
              [],
              [],
              [],
              gasPrice
            );
            // @ts-ignore
            tx.from = process.env.ACCOUNT_ADDRESS_TEST;
            // @ts-ignore
            tx.nonce = Web3Utils.toHex(nonce);
            tx.gasLimit = Web3Utils.toHex("1000000");
            tx.gasPrice = Web3Utils.toHex(tx.gasPrice.toFixed(0));

            let signedTx = new Tx(tx, {
              chain: "ropsten",
              hardfork: "petersburg"
            });
            signedTx.sign(Buffer.from(process.env.ACCOUNT_SECRET_TEST, "hex"));
            // @ts-ignore
            signedTx = "0x" + signedTx.serialize().toString("hex");
            // @ts-ignore
            return global.web3.ropsten.eth.sendSignedTransaction(signedTx);
          });
        });
    });
  }).timeout(120000);
});

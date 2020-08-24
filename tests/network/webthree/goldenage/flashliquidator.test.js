const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;
const assert = require("assert");

const Tx = require("ethereumjs-tx").Transaction;
const Web3Utils = require("web3-utils");

const AccountService = require("../../../../src/network/web/compound/accountservice");
const FlashLiquidator = require("../../../../src/network/webthree/goldenage/flashliquidator");
const Reporter = require("../../../../src/network/web/coinbase/reporter");

describe("network/webthree/goldenage || FlashLiquidator Test", () => {
  const accountService = new AccountService();

  let accounts;
  let borrowers = [];
  let repayTokens = [];
  let seizeTokens = [];

  xit("should liquidate multiple accounts", () => {
    const config = { network: "ropsten", page_size: 200 };
    return accountService.fetch(config).then(res => {
      assert("accounts" in res);
      accounts = res.accounts.filter(a => a.health() < 1.0);
      assert(accounts.length > 0);

      for (let account of accounts) {
        let repayToken = null;
        let seizeToken = null;

        for (let token of account.tokens) {
          // borrow token can only be ETH
          if (
            token.address() === "0xbe839b6d93e3ea47effcca1f27841c917a8794f3" &&
            Number(token.borrowBalanceUnderlying()) > 0.5
          ) {
            repayToken = token.address();
            continue;
          }
          if (Number(token.supplyBalanceUnderlying()) > 0.5) {
            seizeToken = token.address();
            continue;
          }
        }

        if (repayToken !== null && seizeToken !== null) {
          borrowers.push(account.address());
          repayTokens.push(repayToken);
          seizeTokens.push(seizeToken);
        }
      }

      assert(borrowers.length > 0);
      console.log(borrowers.length);

      return web3s.ropsten[0].eth.getGasPrice().then(gasPrice => {
        gasPrice = Big(gasPrice).times(1.2);
        return FlashLiquidator.ropsten
          .liquidateMany(
            borrowers.splice(0, 1),
            repayTokens.splice(0, 1),
            seizeTokens.splice(0, 1),
            gasPrice
          )
          .then(tx => {
            tx.from = process.env.ACCOUNT_ADDRESS_TEST;
            tx.nonce = Web3Utils.toHex(17);
            tx.gasLimit = Web3Utils.toHex(tx.gasLimit.toFixed(0));
            tx.gasPrice = Web3Utils.toHex(tx.gasPrice.toFixed(0));

            console.log(tx);

            let signedTx = new Tx(tx, {
              chain: "ropsten",
              hardfork: "petersburg"
            }); // Could add chain/hardfork specifics here
            signedTx.sign(Buffer.from(process.env.ACCOUNT_SECRET_TEST, "hex"));
            signedTx = "0x" + signedTx.serialize().toString("hex");

            return web3s.ropsten[0].eth.sendSignedTransaction(signedTx);
          });
      });
    });
  }).timeout(120000);

  it("should update price", () => {
    return web3s.ropsten[0].eth.getGasPrice().then(gasPrice => {
      gasPrice = Big(gasPrice).times(1.2);

      return web3s.ropsten[0].eth
        .getTransactionCount(process.env.ACCOUNT_ADDRESS_TEST)
        .then(nonce => {
          return Reporter.mainnet.fetch().then(() => {
            const postableData = Reporter.mainnet.postableData();
            return FlashLiquidator.ropsten
              .liquidateManyWithPriceUpdate(
                postableData[0],
                postableData[1],
                postableData[2],
                [],
                [],
                [],
                gasPrice
              )
              .then(tx => {
                tx.from = process.env.ACCOUNT_ADDRESS_TEST;
                tx.nonce = Web3Utils.toHex(nonce);
                tx.gasLimit = Web3Utils.toHex("1000000");
                tx.gasPrice = Web3Utils.toHex(tx.gasPrice.toFixed(0));

                let signedTx = new Tx(tx, {
                  chain: "ropsten",
                  hardfork: "petersburg"
                });
                signedTx.sign(
                  Buffer.from(process.env.ACCOUNT_SECRET_TEST, "hex")
                );
                signedTx = "0x" + signedTx.serialize().toString("hex");

                return web3s.ropsten[0].eth.sendSignedTransaction(signedTx);
              });
          });
        });
    });
  }).timeout(120000);
});

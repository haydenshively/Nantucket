const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const assert = require("assert");

const Wallet = require("../../../src/network/webthree/wallet");

describe("network/webthree || Wallet Test", () => {
  const wallet = new Wallet("ACCOUNT_ADDRESS_TEST", "ACCOUNT_SECRET_TEST");

  it("should retrieve lowest unconfirmed nonce", async () => {
    const nonce = await wallet.getLowestLiquidNonce();
    assert(typeof nonce === "number");
    assert(Number.isInteger(nonce));
  });

  it("should sign transactions", () => {
    const tx = {
      nonce: web3.utils.toHex("0"),
      gasPrice: web3.utils.toHex("35000000000"),
      gasLimit: web3.utils.toHex("21000"),
      to: "0x0123456789012345678901234567890123456789",
      value: web3.utils.toHex("0")
    };

    assert(typeof wallet._sign(tx) === "string");
    tx.data = web3.utils.toHex("Hello World");
    assert(typeof wallet._sign(tx) === "string");
    delete tx.value;
    assert(typeof wallet._sign(tx) === "string");
  });

  // Interferes with TxQueue tests
  // it("should send a transaction", async () => {
  //   const nonce = await wallet.getLowestLiquidNonce();
  //   wallet.emptyTx.gasPrice = Big(await web3.eth.getGasPrice());
  //   const sentTx = wallet.signAndSend(wallet.emptyTx, nonce, true);

  //   return sentTx.then(receipt => {
  //     assert(receipt.status === true);
  //     assert(receipt.to === process.env[wallet._envKeyAddress].toLowerCase());
  //     assert(receipt.to === receipt.from);
  //     assert(receipt.gasUsed === 21000);
  //   })
  // }).timeout(60000);
});

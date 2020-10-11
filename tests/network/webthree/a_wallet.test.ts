import Big from "../../../src/big"

import assert from "assert";
import Web3Utils from "web3-utils";
import Wallet from "../../../src/network/webthree/wallet";

describe("network/webthree || Wallet Test", () => {
  const wallet = new Wallet(
    // @ts-ignore
    global.web3.ropsten,
    "ACCOUNT_ADDRESS_TEST",
    "ACCOUNT_SECRET_TEST"
  );

  it("should retrieve lowest unconfirmed nonce", async () => {
    const nonce = await wallet.getLowestLiquidNonce();
    assert(typeof nonce === "number");
    assert(Number.isInteger(nonce));
  });

  it("should initialize with correct chain", () => {
    // @ts-ignore
    return wallet.init().then(() => assert(wallet.net.chain === "ropsten"));
  });

  it("should sign transactions", () => {
    const tx = {
      nonce: Web3Utils.toHex("0"),
      gasPrice: Web3Utils.toHex("35000000000"),
      gasLimit: Web3Utils.toHex("21000"),
      to: "0x0123456789012345678901234567890123456789",
      value: Web3Utils.toHex("0")
    };

    assert(typeof wallet._sign(tx) === "string");
    // @ts-ignore
    tx.data = Web3Utils.toHex("Hello World");
    assert(typeof wallet._sign(tx) === "string");
    delete tx.value;
    assert(typeof wallet._sign(tx) === "string");
  });

  it("should send a transaction", async () => {
    const nonce = await wallet.getLowestLiquidNonce();
    // @ts-ignore
    wallet.emptyTx.gasPrice = Big(await global.web3.ropsten.eth.getGasPrice());
    const sentTx = wallet.signAndSend(wallet.emptyTx, nonce);

    return sentTx.then(receipt => {
      assert(receipt.status === true);
      // @ts-ignore
      assert(receipt.to === process.env[wallet.envKeyAddress].toLowerCase());
      assert(receipt.to === receipt.from);
      assert(receipt.gasUsed === 21000);
    });
  }).timeout(120000);
});

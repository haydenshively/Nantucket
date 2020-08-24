const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const assert = require("assert");
const Web3Utils = require("web3-utils");

const TxQueue = require("../../../src/network/webthree/txqueue");

describe("network/webthree || TxQueue Test", () => {
  const chain = web3.ropsten;
  const txQueue = new TxQueue(
    chain,
    "ACCOUNT_ADDRESS_TEST",
    "ACCOUNT_SECRET_TEST"
  );

  it("should initialize with correct chain", () => {
    return txQueue
      .init()
      .then(() => assert(txQueue._wallet._net.chain === "ropsten"));
  });

  it("should map nonces to indices", async () => {
    await txQueue.rebase();
    const indices = [0, 1, 2, 3, 4, 5, 6];
    for (let i of indices) {
      assert(txQueue.idx(txQueue.nonce(i)) === i);
      assert(txQueue.nonce(i) === txQueue._lowestLiquidNonce + i);
    }
  });

  it("should append and dump a transaction", async () => {
    await txQueue.rebase();
    const tx = {
      gasPrice: Big(await chain.eth.getGasPrice()).times(0.8),
      gasLimit: Big("36000"),
      to: "0x0000000000000000000000000000000000000000",
      value: Web3Utils.toHex("0")
    };
    // test append
    txQueue.append({ ...tx });
    assert(txQueue.length === 1);
    assert(txQueue.tx(0).gasPrice.eq(tx.gasPrice));
    // test replace
    tx.gasPrice = tx.gasPrice.minus(1000000);
    txQueue.replace(0, { ...tx }, "clip");
    assert(txQueue.length === 1);
    assert(txQueue.tx(0).gasPrice.eq(tx.gasPrice.plus(1000000).times(1.12)));
    // test dump
    txQueue.dump(0);
    assert(txQueue.length === 1);
    assert(txQueue.tx(0).gasLimit.eq("21000"));
  }).timeout(120000);
});

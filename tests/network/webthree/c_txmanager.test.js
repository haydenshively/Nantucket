const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const assert = require("assert");

const Wallet = require("../../../src/network/webthree/wallet");
const TxQueue = require("../../../src/network/webthree/txqueue");
const TxManager = require("../../../src/network/webthree/txmanager");

describe("network/webthree || TxManager Test", () => {
  const chain = web3.ropsten;
  const txManager = new TxManager(
    new TxQueue(
      new Wallet(chain, "ACCOUNT_ADDRESS_TEST", "ACCOUNT_SECRET_TEST")
    ),
    500,
    0.1
  );

  it("should initialize with correct chain", () => {
    return txManager
      .init()
      .then(() => assert(txManager._queue._wallet._net.chain === "ropsten"));
  });

  it("should get gas price", () => {
    txManager._revenue = 0.01;
    return txManager._getInitialGasPrice(Big(2000000)).then(gasPrice => {
      assert(gasPrice.div(1e9).gt(0));
    });
  });

  it("should compute fee properly", () => {
    const gasPrice = Big(100).times(1e9);
    const gasLimit = Big(500000);
    const fee = TxManager._estimateFee({
      gasPrice: gasPrice,
      gasLimit: gasLimit
    });
    assert(fee.eq("0.05"));
  });

  it("shouldn't send tx at a loss", () => {
    txManager._storeCandidate({
      label: "0x7e3A",
      address: "0x7e3A0C2300175FF712742c21F36216e9fb63b487",
      ctokenidpay: "0x0000000000000000000000000000000000000000",
      ctokenidseize: "0x0000000000000000000000000000000000000000",
      profitability: 0
    });
    return txManager._cacheTransaction().then(() => {
      txManager._sendIfProfitable(txManager._tx);
      assert(txManager._queue.length === 0);
    });
  });

  it("should stop cleanly", () => {
    txManager.stop();
    assert(txManager._revenue === 0.0);
    assert(txManager._tx === null);
  });

  // Must skip this test when it's running on Ropsten because
  // the gas price is so low that we end up raising bid many many
  // times and hit rate limit on Infura
  xit("should raise minimally and stop bidding eventually", () => {
    txManager._storeCandidate({
      label: "0x7e3A",
      address: "0x7e3A0C2300175FF712742c21F36216e9fb63b487",
      ctokenidpay: "0x0000000000000000000000000000000000000000",
      ctokenidseize: "0x0000000000000000000000000000000000000000",
      profitability: 0.01
    });
    return txManager._cacheTransaction().then(() => {
      let gasPrice = txManager._tx.gasPrice;
      for (let i = 0; i < 100; i++) {
        txManager._sendIfProfitable(txManager._tx);
        assert(
          txManager._tx.gasPrice.eq(gasPrice) ||
            txManager._tx.gasPrice.eq(gasPrice.times(1.12))
        );
        gasPrice = txManager._tx.gasPrice;
      }
      assert(txManager._queue.length === 1);
      assert(TxManager._estimateFee(txManager._tx).lte("0.05"));
    });
  });

  it("should remove candidates", () => {
    txManager._removeStaleCandidates(0);
    assert(Object.keys(txManager._candidates).length === 0);
    txManager._cacheTransaction();
    assert(txManager._tx === null);
  });
});

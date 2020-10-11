import Big from "../../../src/big";

import assert from "assert";
import TxManager from "../../../src/network/webthree/txmanager";

describe("network/webthree || TxManager Test", () => {
  // @ts-ignore
  const chain = global.web3.ropsten;
  const txManager = new TxManager(
    chain,
    "ACCOUNT_ADDRESS_TEST",
    "ACCOUNT_SECRET_TEST",
    500,
    0.1
  );

  it("should initialize with correct chain", () => {
    return txManager
      .init()
      // @ts-ignore
      .then(() => assert(txManager.queue.wallet.net.chain === "ropsten"));
  });

  it("should get gas price", () => {
    return txManager._getInitialGasPrice().then(gasPrice => {
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
      // @ts-ignore
      txManager._sendIfProfitable(txManager.tx);
      // @ts-ignore
      assert(txManager.queue.length === 0);
    });
  });

  it("should stop cleanly", () => {
    txManager.stop();
    // @ts-ignore
    assert(txManager.revenue === 0.0);
    // @ts-ignore
    assert(txManager.tx === null);
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
      // @ts-ignore
      let gasPrice = txManager.tx.gasPrice;
      for (let i = 0; i < 100; i++) {
        // @ts-ignore
        txManager._sendIfProfitable(txManager.tx);
        assert(
          // @ts-ignore
          txManager.tx.gasPrice.eq(gasPrice) ||
          // @ts-ignore
            txManager.tx.gasPrice.eq(gasPrice.times(1.12))
        );
        // @ts-ignore
        gasPrice = txManager.tx.gasPrice;
      }
      // @ts-ignore
      assert(txManager.queue.length === 1);
      // @ts-ignore
      assert(TxManager._estimateFee(txManager.tx).lte("0.05"));
    });
  });

  it("should remove candidates", () => {
    txManager._removeStaleCandidates(0);
    // @ts-ignore
    assert(Object.keys(txManager.candidates).length === 0);
    txManager._cacheTransaction();
    // @ts-ignore
    assert(txManager.tx === null);
  });
});

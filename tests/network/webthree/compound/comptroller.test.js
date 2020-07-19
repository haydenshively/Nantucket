const assert = require("assert");

const Comptroller = require("../../../../src/network/webthree/compound/comptroller");
const Tokens = require("../../../../src/network/webthree/compound/ctoken");

describe("network/webthree/compound || Comptroller Test", () => {
  it("should retrieve liquidation incentive", () => {
    Comptroller.mainnet.contract.methods.closeFactorMantissa().call().then(result => {
      console.log(typeof(result));
    })
    return Comptroller.mainnet.liquidationIncentive().then(result => {
      assert(result > 1.0);
    });
  });

  it("should retrieve close factor", () => {
    return Comptroller.mainnet.closeFactor().then(result => {
      assert(result > 0.0);
    });
  });

  it("should retrieve cDAI collateral factor", () => {
    return Comptroller.mainnet
      .collateralFactorFor(Tokens.mainnet.cDAI)
      .then(result => {
        assert(result > 0.0);
      });
  });

  it("should retrieve active markets", () => {
    return Comptroller.mainnet
      .marketsEnteredBy(process.env.TEST_ACCOUNT_ADDRESS)
      .then(result => {
        assert(result.length >= 9);
      });
  });

  it("should retrieve account liquidity", () => {
    return Comptroller.mainnet
      .accountLiquidityOf(process.env.TEST_ACCOUNT_ADDRESS)
      .then(result => {
        assert(result[0] > 0.0);
        assert(result[1] == 0);
      });
  });
});

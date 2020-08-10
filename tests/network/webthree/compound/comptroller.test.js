const assert = require("assert");

const Comptroller = require("../../../../src/network/webthree/compound/comptroller");
const Tokens = require("../../../../src/network/webthree/compound/ctoken");

describe("network/webthree/compound || Comptroller Test", () => {
  it("should retrieve liquidation incentive", () => {
    return Comptroller.mainnet.liquidationIncentive().then(result => {
      assert(result.gt(1.0));
    });
  });

  it("should retrieve close factor", () => {
    return Comptroller.mainnet.closeFactor().then(result => {
      assert(result.gt(0.0));
    });
  });

  it("should retrieve cDAI collateral factor", () => {
    return Comptroller.mainnet
      .collateralFactorFor(Tokens.mainnet.cDAI)
      .then(result => {
        assert(result.gt(0.0));
      });
  });

  let TEST_ACCOUNT_ADDRESS;
  for (let key in process.env) {
    if (key.startsWith("ACCOUNT_ADDRESS")) {
      TEST_ACCOUNT_ADDRESS = process.env[key];
    }
  }

  it("should retrieve active markets", () => {
    return Comptroller.mainnet
      .marketsEnteredBy(TEST_ACCOUNT_ADDRESS.toLowerCase())
      .then(result => {
        assert(result.length === 0);
      });
  });

  it("should retrieve account liquidity", () => {
    return Comptroller.mainnet
      .accountLiquidityOf(TEST_ACCOUNT_ADDRESS.toLowerCase())
      .then(result => {
        assert(result[0].eq(0.0));
        assert(result[1].eq(0.0));
      });
  });
});

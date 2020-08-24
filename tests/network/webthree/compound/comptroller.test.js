const assert = require("assert");

const { forAllProviders } = require("../utils");

const Comptroller = require("../../../../src/network/webthree/compound/comptroller");
const Tokens = require("../../../../src/network/webthree/compound/ctoken");

describe("network/webthree/compound || Comptroller Test", () => {
  it("should retrieve liquidation incentive", () => {
    return forAllProviders(
      Comptroller,
      "liquidationIncentive",
      undefined,
      res => assert(res.gte(1.0))
    );
  });

  it("should retrieve close factor", () => {
    return forAllProviders(Comptroller, "closeFactor", undefined, res =>
      assert(res.gt(0.0))
    );
  });

  it("should retrieve collateral factors", async () => {
    for (let chain in web3) {
      for (let symbol in Tokens[chain]) {
        if (!symbol.startsWith("c")) continue;

        const token = Tokens[chain][symbol];
        const caller = Comptroller[chain].collateralFactorFor(token);
        assert((await caller(web3[chain])).lt(1.0));
      }
    }
  }).timeout(10000);

  it("should retrieve active markets", () => {
    return forAllProviders(
      Comptroller,
      "marketsEnteredBy",
      process.env.ACCOUNT_ADDRESS_TEST,
      markets => assert(markets.length === 0)
    );
  });

  it("should retrieve account liquidity", () => {
    return forAllProviders(
      Comptroller,
      "accountLiquidityOf",
      process.env.ACCOUNT_ADDRESS_TEST,
      result => {
        assert(result[0].eq(0.0));
        assert(result[1].eq(0.0));
      }
    );
  });
});

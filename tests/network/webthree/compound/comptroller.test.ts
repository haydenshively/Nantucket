import assert from "assert";

// @ts-ignore
import { forAllProviders } from "../utils";
import Comptroller from "../../../../src/network/webthree/compound/comptroller";
import Tokens from "../../../../src/network/webthree/compound/ctoken";

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
    // @ts-ignore
    for (let chain in global.web3) {
      for (let symbol in Tokens[chain]) {
        if (!symbol.startsWith("c")) continue;

        const token = Tokens[chain][symbol];
        const caller = Comptroller[chain].collateralFactorFor(token);
        // @ts-ignore
        assert((await caller(global.web3[chain])).lt(1.0));
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

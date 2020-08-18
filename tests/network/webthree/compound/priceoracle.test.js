const assert = require("assert");

const PriceOracle = require("../../../../src/network/webthree/compound/priceoracle");
const Tokens = require("../../../../src/network/webthree/compound/ctoken");

describe("network/webthree/compound || PriceOracle Test", () => {
  it("should retrieve USDC price", () => {
    return PriceOracle.mainnet.getUnderlyingPriceUSD(Tokens.mainnet.cUSDC).then(result => {
      assert(result.eq(1.0));
    })
  });
});

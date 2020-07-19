const assert = require("assert");

const PriceOracle = require("../../../../src/network/webthree/compound/priceoracle");
const Tokens = require("../../../../src/network/webthree/compound/ctoken");

describe("network/webthree/compound || PriceOracle Test", () => {
  it("should retrieve ETH price", () => {
    return PriceOracle.mainnet.getUnderlyingPrice(Tokens.mainnet.cDAI.address).then(result => {
      assert(result.gt(0.0));
    })
  });
});

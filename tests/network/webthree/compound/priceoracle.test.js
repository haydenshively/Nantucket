const assert = require("assert");

const PriceOracle = require("../../../../src/network/webthree/compound/priceoracle");
const Tokens = require("../../../../src/network/webthree/compound/ctoken");

describe("network/webthree/compound || PriceOracle Test", () => {
  it("should retrieve prices", async () => {
    for (let net in web3s) {
      for (let symbol in Tokens[net]) {
        if (!symbol.startsWith("c")) continue;

        const token = Tokens[net][symbol];
        const caller = PriceOracle[net].getUnderlyingPriceUSD(token);

        for (let provider of web3s[net]) {
          const res = await caller(provider);
          assert(res.gt(0.0));
        }
      }
    }
  }).timeout(10000);
});

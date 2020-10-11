import assert from "assert";

import PriceOracle from "../../../../src/network/webthree/compound/priceoracle";
import Tokens from "../../../../src/network/webthree/compound/ctoken";

describe("network/webthree/compound || PriceOracle Test", () => {
  it("should retrieve prices", async () => {
    for (let chain in web3) {
      for (let symbol in Tokens[chain]) {
        if (!symbol.startsWith("c")) continue;

        const token = Tokens[chain][symbol];
        const caller = PriceOracle[chain].getUnderlyingPriceUSD(token);
        assert((await caller(web3[chain])).gt(0.0));
      }
    }
  }).timeout(10000);
});

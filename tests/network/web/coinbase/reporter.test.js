const assert = require("assert");

const Reporter = require("../../../../src/network/web/coinbase/reporter");

describe("network/web/coinbase || Reporter Test", () => {
  it("should fetch signed prices", async () => {
    await Reporter.mainnet.fetch();

    for (let address in Reporter.mainnet._symbols) {
      assert(Reporter.mainnet.getPrice(address) > 0);
    }
  });

  it("should generate postable data", async () => {
    await Reporter.mainnet.fetch();

    const included = ["BTC", "ETH", "DAI", "REP", "ZRX", "BAT", "UNI", "COMP"];
    const postable = Reporter.mainnet.postableData(included);
    assert(postable[0].length === postable[1].length);
    included.forEach(ex => assert(postable[2].includes(ex)));
  });
});

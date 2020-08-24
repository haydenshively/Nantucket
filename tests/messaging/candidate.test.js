const assert = require("assert");

// src.messaging
const Candidate = require("../../src/messaging/candidate");
const Channel = require("../../src/messaging/channel");
// src.network.webthree
const Comptroller = require("../../src/network/webthree/compound/comptroller");
const CTokens = require("../../src/network/webthree/compound/ctoken");

describe("messaging || Candidate Test", () => {
  // process.send only exists in child processes
  process.send = msg => process.emit("message", msg);

  const candidate = new Candidate({
    address: process.env["ACCOUNT_ADDRESS_TEST"],
    ctokenidpay: 1,
    ctokenidseize: 2,
    profitability: 0
  });

  candidate._markets = ["foo", "baz", "bar"];

  it("should construct, serialize, and deserialize", () => {
    assert(candidate.label === process.env["ACCOUNT_ADDRESS_TEST"].slice(0, 6));
    assert("markets" in candidate.msg().__data);

    const handler = new Promise((resolve, reject) => {
      Channel(String).on("Test", s => reject());
      Channel(Candidate).on("OtherAction", c => reject());
      Channel(Candidate).on("Test", c => {
        assert(c.address === candidate.address);
        assert(c.ctokenidpay === candidate.ctokenidpay);
        assert(c.ctokenidseize === candidate.ctokenidseize);
        assert(c.profitability === candidate.profitability);
        c._markets.forEach(m => assert(candidate._markets.includes(m)));

        resolve();
      });
    });

    candidate.msg().broadcast("Test");
    return handler;
  });

  it("should init properly", async () => {
    await candidate.refreshBalances(web3s.mainnet[0], Comptroller.mainnet, CTokens.mainnet);
    assert(candidate._markets.length === 0);
  });

  it("should get liquidity", async () => {
    assert(
      (await candidate.liquidityOnChain(web3s.mainnet[0], Comptroller.mainnet))
        .length === 2
    );
  });
});

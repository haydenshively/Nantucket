import assert from "assert";
// src.messaging
import Candidate from "../../src/messaging/candidate";
import Channel from "../../src/messaging/channel";
// src.network.webthree
import Comptroller from "../../src/network/webthree/compound/comptroller";
import { EthNet } from "../../src/network/webthree/ethnet";

describe("messaging || Candidate Test", () => {
  // process.send only exists in child processes
  // @ts-ignore
  process.send = msg => process.emit("message", msg);

  const candidate = new Candidate({
    address: process.env["ACCOUNT_ADDRESS_TEST"],
    ctokenidpay: 1,
    ctokenidseize: 2,
    profitability: 0
  });

  // @ts-ignore
  candidate.markets = ["foo", "baz", "bar"];

  it("should construct, serialize, and deserialize", () => {
    assert(candidate.label === process.env["ACCOUNT_ADDRESS_TEST"].slice(0, 6));
    // @ts-ignore
    assert("markets" in candidate.msg().data);

    const handler = new Promise((resolve, reject) => {
      Channel.for(String).on("Test", s => reject());
      Channel.for(Candidate).on("OtherAction", c => reject());
      Channel.for(Candidate).on("Test", c => {
        assert(c.address === candidate.address);
        assert(c.ctokenidpay === candidate.ctokenidpay);
        assert(c.ctokenidseize === candidate.ctokenidseize);
        assert(c.profitability === candidate.profitability);
        // @ts-ignore
        c._markets.forEach(m => assert(candidate.markets.includes(m)));

        resolve();
      });
    });

    candidate.msg().broadcast("Test");
    return handler;
  });

  it("should init properly", async () => {
    await candidate.refreshBalances(
      // @ts-ignore
      global.web3.mainnet,
      Comptroller.forNet(EthNet.mainnet),
      EthNet.mainnet
    );
    // @ts-ignore
    assert(candidate.markets.length === 0);
  });

  it("should get liquidity", async () => {
    assert(
      // @ts-ignore
      (await candidate.liquidityOnChain(web3.mainnet, Comptroller.mainnet))
        .length === 2
    );
  });
});

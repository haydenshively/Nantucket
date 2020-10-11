import assert from "assert";
import { mainnet as ReporterMainnet } from "../../../../src/network/web/coinbase/reporter";

describe("network/web/coinbase || Reporter Test", () => {
  it("should fetch signed prices", async () => {
    await ReporterMainnet.fetch();

    // @ts-ignore
    for (let address in ReporterMainnet.symbols) {
      assert(ReporterMainnet.getPrice(address) > 0);
    }
  });

  it("should generate postable data", async () => {
    await ReporterMainnet.fetch();

    const exclude = ["XTZ", "LINK", "KNC", "COMP"];
    const postable = ReporterMainnet.postableData(exclude);

    assert(postable[0].length === postable[1].length);
    exclude.forEach(ex => assert(!postable[2].includes(ex)));
  });
});

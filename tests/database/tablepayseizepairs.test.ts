const assert = require("assert");

const TablePaySeizePairs = require("../../src/database/tablepayseizepairs");

describe("database || Table Pay/Seize Test", () => {
  const table = new TablePaySeizePairs(pool, null);

  it("should retrieve id -> pair -> id", async function() {
    const id = 1;
    const pair = await table.getPair(id);
    assert(id === (await table.getID(pair.ctokenidpay, pair.ctokenidseize)));
  });
});

const assert = require("assert");

const TableUsers = require("../../src/database/tableusers");

describe("database || Table Users Test", () => {
  const table = new TableUsers(pool, null, null);

  it("should retrieve liquidation candidates", async function() {
    const candidates = await table.getLiquidationCandidates(10, 100);

    assert(candidates.length === 10);
  });

  it("should retrieve cToken collateral factor and cost in Eth", async function() {
    const { collat, costineth } = await table.getCollatAndCost(1);
    assert(collat >= 0.0);
    assert(costineth >= 0.0);
  });
});

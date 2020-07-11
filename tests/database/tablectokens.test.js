const assert = require("assert");

const TableCTokens = require("../../src/database/tablectokens");

describe("database || Table CTokens Test", () => {
  const table = new TableCTokens(pool, null);

  it("should retrieve id -> address -> id", async function() {
    const id = 1;
    const address = await table.getAddress(id);
    assert(id === (await table.getID(address)));
  });
});

import assert from "assert";
import TableCTokens from "../../src/database/tablectokens";

describe("database || Table CTokens Test", () => {
  // @ts-ignore
  const table = new TableCTokens(global.pool, null);

  it("should retrieve id -> address -> id", async function() {
    const id = 1;
    const address = await table.getAddress(id);
    assert(id === (await table.getID(address)));
  });
});

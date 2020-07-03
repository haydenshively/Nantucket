const assert = require("assert");

const AccountService = require("../../../../src/network/web/compound/accountservice");
const service = new AccountService();

describe("network/web/compound || Account Service Test", () => {
  it("should retrieve some accounts", () => {
    return service.fetch({}).then(result => {
      assert(result.error === null);
    });
  }).timeout(10000);

  it("should retrieve different pages", async () => {
    let result;
    result = await service.fetch({ page_number: 1 });
    assert(result.pagination.page_number === 1);

    result = await service.fetch({ page_number: 2 });
    assert(result.pagination.page_number === 2);
  }).timeout(10000);
});

const assert = require("assert");

const CTokenService = require("../../../../src/network/web/compound/ctokenservice");
const service = new CTokenService();

describe("network/web/compound || cToken Service Test", () => {
  it("should retrieve some cTokens", () => {
    return service.fetch({}).then(result => {
      assert(result.error === null);
    });
  }).timeout(10000);
});

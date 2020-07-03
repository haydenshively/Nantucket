const assert = require("assert");

const CTokenService = require("../../../../src/network/web/compound/ctokenservice");
const service = new CTokenService();

describe("Compound CToken Service", () => {
  it("should retrieve some CTokens", () => {
    return service.fetch({}).then(result => {
      assert(result.error === null);
    });
  }).timeout(10000);
});

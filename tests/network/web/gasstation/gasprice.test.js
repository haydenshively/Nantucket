const assert = require("assert");

const GasPrice = require("../../../../src/network/web/gasstation/gasprice");
const gasPrice = new GasPrice();

describe("network/web/gasstation || Gas Price Test", () => {
  it("should retrieve current gas prices", () => {
    return gasPrice.fetch().then(result => {
      for (key in result) {
        assert(result.key !== null);
      }
    });
  });
});

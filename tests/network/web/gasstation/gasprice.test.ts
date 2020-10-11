import assert from "assert";
import GasPrice from "../../../../src/network/web/gasstation/gasprice";

const gasPrice = new GasPrice();

describe("network/web/gasstation || Gas Price Test", () => {
  it("should retrieve current gas prices", () => {
    return gasPrice.fetch().then(result => {
      for (let key in result) {
        // TODO: Does this do what we think it does?
        assert(result[key] !== null);
      }
    });
  });
});

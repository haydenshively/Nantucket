const assert = require("assert");

const AddressInfo = require("../../../../src/network/web/ethplorer/addressinfo");
const addressInfo = new AddressInfo();

describe("network/web/ethplorer || Address Info Test", () => {
  it("should retrieve account balance", () => {
    for (let key in process.env) {
      if (key.startsWith("ACCOUNT_ADDRESS")) {
        return addressInfo.fetch(process.env[key]).then(result => {
          assert(result.error === undefined);
        });
      }
    }
  });
});

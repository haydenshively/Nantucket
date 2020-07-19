const assert = require("assert");

const AddressInfo = require("../../../../src/network/web/ethplorer/addressinfo");
const addressInfo = new AddressInfo();

describe("network/web/ethplorer || Address Info Test", () => {
  it("should retrieve account balance", () => {
    return addressInfo.fetch(process.env.TEST_ACCOUNT_ADDRESS).then(result => {
      assert(result.error === undefined);
    });
  });
});

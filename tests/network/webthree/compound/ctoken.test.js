const assert = require("assert");

const Tokens = require("../../../../src/network/webthree/compound/ctoken");

describe("network/webthree/compound || cToken Test", () => {
  it("should retrieve cDAI exchange rates", () => {
    return Tokens.mainnet.cDAI.exchangeRate().then(result => {
      assert(result != 0.0);
    });
  });

  it("should retrieve cDAI borrow rate", () => {
    return Tokens.mainnet.cDAI.borrowRate().then(result => {
      assert(result != 0.0);
    });
  });

  it("should retrieve cDAI supply rate", () => {
    return Tokens.mainnet.cDAI.supplyRate().then(result => {
      assert(result != 0.0);
    });
  });

  it("should retrieve cDAI units in circulation", () => {
    return Tokens.mainnet.cDAI.cUnitsInCirculation().then(result => {
      assert(result != 0.0);
    });
  });

  it("should retrieve cDAI units in contract", () => {
    return Tokens.mainnet.cDAI.uUnitsSupplied().then(result => {
      assert(result != 0.0);
    });
  });

  it("should retrieve cDAI units loaned out", () => {
    return Tokens.mainnet.cDAI.uUnitsBorrowed().then(result => {
      assert(result != 0.0);
    });
  });
});

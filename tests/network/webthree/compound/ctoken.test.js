const assert = require("assert");

const { forAllTokens } = require("../utils");

const Tokens = require("../../../../src/network/webthree/compound/ctoken");

describe("network/webthree/compound || cToken Test", () => {
  it("should retrieve exchange rates", () => {
    return forAllTokens(Tokens, "exchangeRate", undefined, x =>
      assert(!x.eq(0.0))
    );
  }).timeout(10000);

  it("should retrieve borrow rates", () => {
    return forAllTokens(Tokens, "borrowRate", undefined, x =>
      assert(!x.eq(0.0))
    );
  }).timeout(10000);

  it("should retrieve supply rates", () => {
    return forAllTokens(Tokens, "supplyRate", undefined, x =>
      assert(x.s === 1)
    );
  }).timeout(10000);

  it("should retrieve units in circulation", () => {
    return forAllTokens(Tokens, "cUnitsInCirculation", undefined, x =>
      assert(!x.eq(0.0))
    );
  }).timeout(10000);

  it("should retrieve units in contract", () => {
    return forAllTokens(Tokens, "uUnitsSupplied", undefined, x =>
      assert(!x.eq(0.0))
    );
  }).timeout(10000);

  it("should retrieve units loaned out", () => {
    return forAllTokens(Tokens, "uUnitsBorrowed", undefined, x =>
      assert(x.s === 1)
    );
  }).timeout(10000);
});

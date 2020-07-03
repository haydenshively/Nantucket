require("dotenv").config();

const assert = require("assert");

const Tokens = require("../../../../src/network/webthree/compound/ctoken");

describe("Compound cToken Test", () => {
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
    return Tokens.mainnet.cDAI.uUnitsInContract().then(result => {
      assert(result != 0.0);
    });
  });

  it("should retrieve cDAI units loaned out", () => {
    return Tokens.mainnet.cDAI.uUnitsLoanedOut().then(result => {
      assert(result != 0.0);
    });
  });
});

// // Tokens.mainnet.cDAI.uUnitsLoanedOutTo(accountToLiquidate).then((uUnitsLoaned) => {
// //   Comptroller.mainnet.closeFactor().then((closeFactor) => {
// //     maxLiquidation = uUnitsLoaned*(closeFactor - 0.1);
// //     console.log('Max Liquidation: ' + maxLiquidation.toString());
// //     Tokens.mainnet.cDAI.liquidate_uUnits(accountToLiquidate, maxLiquidation, Tokens.mainnet.cETH.address, process.env.PUBLIC_KEY);
// //   });
// // });
// // Tokens.mainnet.cDAI.withdraw_uUnits(1, process.env.PUBLIC_KEY);
// // Tokens.mainnet.cDAI.supply_uUnits(1, process.env.PUBLIC_KEY);
// // Tokens.mainne

const Contract = require("../smartcontract");
const LIQUIDATORABI = require("../abis/goldenage/flashliquidator.json");

function toFixed(x) {
  if (Math.abs(x) < 1.0) {
    var e = parseInt(x.toString().split("e-")[1]);
    if (e) {
      x *= Math.pow(10, e - 1);
      x = "0." + new Array(e).join("0") + x.toString().substring(2);
    }
  } else {
    var e = parseInt(x.toString().split("+")[1]);
    if (e > 20) {
      e -= 20;
      x /= Math.pow(10, e);
      x += new Array(e + 1).join("0");
    }
  }
  return x;
}

class FlashLiquidator extends Contract {
  // Performs liquidation (SEND -- uses gas)
  // borrower: account address of any user with negative account_liquidity
  // amount: the amount of debt to repay, in units of the ordinary asset
  // cTokenToSeize: an address of a cToken that the borrower holds as collateral
  liquidate(borrower, borrowedCToken, collatCToken, amount, gasPrice) {
    const hexAmount = web3.utils.toHex(web3.utils.toBN(toFixed(Math.floor(amount))));
    const encodedMethod = this.contract.methods
      .liquidate(borrower, borrowedCToken, collatCToken, hexAmount)
      .encodeABI();

    return this.txFor(encodedMethod, 3000000, gasPrice);
  }
}

exports.FlashLiquidator = FlashLiquidator;
exports.mainnet = new FlashLiquidator(
  "0x6bfdfCC0169C3cFd7b5DC51c8E563063Df059097",
  LIQUIDATORABI
);

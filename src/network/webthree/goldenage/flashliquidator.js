const Contract = require("../smartcontract");
const LIQUIDATORABI = require("../abis/goldenage/flashliquidator.json");

class FlashLiquidator extends Contract {
  // Performs liquidation (SEND -- uses gas)
  // borrower: account address of any user with negative account_liquidity
  // amount: the amount of debt to repay, in units of the ordinary asset
  // cTokenToSeize: an address of a cToken that the borrower holds as collateral
  liquidate(borrower, borrowedCToken, collatCToken, amount, gasPrice) {
    const hexAmount = web3.utils.toHex(web3.utils.toBN(amount));
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

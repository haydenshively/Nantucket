const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Contract = require("../smartcontract");
const LIQUIDATORABI = require("../abis/goldenage/flashliquidator.json");

class FlashLiquidator extends Contract {
  /**
   * Performs liquidation (SEND -- uses gas)
   * 
   * @param {string} borrower address of any user with negative liquidity
   * @param {string} repayCToken address of token to repay
   * @param {string} seizeCToken address of token to seize
   * @param {Big} amount debt to repay, in units of the ordinary asset
   * @param {number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  liquidate(borrower, repayCToken, seizeCToken, amount, gasPrice) {
    const hexAmount = web3.utils.toHex(amount.toFixed(0));
    const encodedMethod = this.contract.methods
      .liquidate(borrower, repayCToken, seizeCToken, hexAmount)
      .encodeABI();

    return this.txFor(encodedMethod, "2300000", gasPrice);
  }

  /**
   * Performs liquidation on multiple accounts (SEND -- uses gas)
   * 
   * @param {Array.<String>} borrowers addresses of users with negative liquidity
   * @param {Array.<String>} repayCTokens address of token to repay
   * @param {Array.<String>} seizeCTokens address of token to seize
   * @param {number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  liquidateMany(borrowers, repayCTokens, seizeCTokens, gasPrice) {
    const encodedMethod = this.contract.methods
      .liquidateMany(borrowers, repayCTokens, seizeCTokens)
      .encodeABI();

    const gas = String(25 * borrowers.length) + "00000";
    return this.txFor(encodedMethod, gas, gasPrice);
  }
}

exports.FlashLiquidator = FlashLiquidator;
exports.mainnet = new FlashLiquidator(
  // "0x6bfdfCC0169C3cFd7b5DC51c8E563063Df059097", // V1 (repay & seize tokens must be different)
  // "0xFb3c1a8B2Baa50caF52093d7AF2450a143dbb212", // V2 (repay & seize tokens can be same)
  "0x0733691100483A1107b7fC156216525ECE2E5fc1", // V3 (multi-account liquidate & return on 0 shortfall)
  LIQUIDATORABI
);

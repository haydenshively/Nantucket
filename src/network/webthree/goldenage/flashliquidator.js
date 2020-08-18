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
  async liquidate(borrower, repayCToken, seizeCToken, amount, gasPrice) {
    const hexAmount = web3.utils.toHex(amount.toFixed(0));
    const method = this.contract.methods.liquidate(
      borrower,
      repayCToken,
      seizeCToken,
      hexAmount
    );
    const gasLimit = 1.07 * (await method.estimateGas({ gas: "3000000" }));

    return this.txFor(method.encodeABI(), gasLimit.toFixed(0), gasPrice);
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
  async liquidateMany(borrowers, repayCTokens, seizeCTokens, gasPrice) {
    const cTokens = this._combineTokens(repayCTokens, seizeCTokens);
    const method = this.contract.methods.liquidateMany(borrowers, cTokens);
    const gasLimit =
      1.07 *
      (await method.estimateGas({
        gas: String(3 * borrowers.length) + "000000"
      }));

    return this.txFor(method.encodeABI(), gasLimit.toFixed(0), gasPrice);
  }

  async liquidateManyWithPriceUpdate(
    messages,
    signatures,
    symbols,
    borrowers,
    repayCTokens,
    seizeCTokens,
    gasPrice
  ) {
    const cTokens = this._combineTokens(repayCTokens, seizeCTokens);
    const method = this.contract.methods.liquidateManyWithPriceUpdate(
      messages,
      signatures,
      symbols,
      borrowers,
      cTokens
    );
    const gasLimit =
      1.07 *
      (await method.estimateGas({
        gas: String(3 * borrowers.length) + "000000"
      }));

    return this.txFor(method.encodeABI(), gasLimit.toFixed(0), gasPrice);
  }

  _combineTokens(repayList, seizeList) {
    let cTokens = [];
    for (let i = 0; i < repayList.length; i++)
      cTokens.push(repayList[i], seizeList[i]);
    return cTokens;
  }
}

exports.FlashLiquidator = FlashLiquidator;
exports.mainnet = new FlashLiquidator(
  // "0x6bfdfCC0169C3cFd7b5DC51c8E563063Df059097", // V1 (repay & seize tokens must be different)
  // "0xFb3c1a8B2Baa50caF52093d7AF2450a143dbb212", // V2 (repay & seize tokens can be same)
  // "0x0733691100483A1107b7fC156216525ECE2E5fc1", // V3 (multi-account liquidate & return on 0 shortfall)
  "0x82c539c060E28B667B43ecBE0B12011e9b617b5e", // V4 (add support for open price feed)
  LIQUIDATORABI
);

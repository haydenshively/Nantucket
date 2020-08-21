const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Web3Utils = require("web3-utils");

const SmartContract = require("../smartcontract");

class FlashLiquidator extends SmartContract {
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
    const hexAmount = Web3Utils.toHex(amount.toFixed(0));
    const method = this._inner.methods.liquidate(
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
    const method = this._inner.methods.liquidateMany(borrowers, cTokens);
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
    const method = this._inner.methods.liquidateManyWithPriceUpdate(
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

const addresses = {
  mainnet: "0x82c539c060E28B667B43ecBE0B12011e9b617b5e",
  ropsten: "0x2ab4C66757a9934b3a0dBD91f94bE830855839cd"
};

for (let net in web3s) {
  const abi = require(`../abis/${net}/goldenage/flashliquidator.json`);

  exports[net] = web3s[net].map(provider => {
    return new FlashLiquidator(addresses[net], abi, provider);
  });
}

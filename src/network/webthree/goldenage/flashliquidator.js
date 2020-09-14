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
   * @param {Number} gasPrice the gas price to use, in gwei
   * @return {Promise<Object>} the transaction object
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

    return this.txFor(method, Big(gasLimit), gasPrice);
  }

  /**
   * Performs liquidation on multiple accounts (SEND -- uses gas)
   *
   * @param {Array<String>} borrowers addresses of users with negative liquidity
   * @param {Array<String>} repayCTokens address of token to repay
   * @param {Array<String>} seizeCTokens address of token to seize
   * @param {Number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  liquidateMany(borrowers, repayCTokens, seizeCTokens, gasPrice) {
    const cTokens = this._combineTokens(repayCTokens, seizeCTokens);
    const method = this._inner.methods.liquidateMany(borrowers, cTokens);
    const gasLimit = String(20 * borrowers.length) + "00000";

    return this._txFor(method, Big(gasLimit).plus(100000), gasPrice);
  }

  liquidateManyWithPriceUpdate(
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
    const gasLimit = Big(1600000).times(borrowers.length);

    return this._txFor(method, gasLimit.plus(400000), gasPrice);
  }

  _combineTokens(repayList, seizeList) {
    let cTokens = [];
    for (let i = 0; i < repayList.length; i++)
      cTokens.push(repayList[i], seizeList[i]);
    return cTokens;
  }
}

const addresses = {
  mainnet: "0xbd08B0A4A6e591a7705238c5b3cC9fc5382fbB30",
  ropsten: "0x7c432107Fbf4a88fF8630Fcd2A6384826718a0E7"
};

for (let net in addresses) {
  const abi = require(`../abis/${net}/goldenage/flashliquidator.json`);
  exports[net] = new FlashLiquidator(addresses[net], abi);
}

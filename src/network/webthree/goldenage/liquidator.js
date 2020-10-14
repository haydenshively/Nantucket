const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Web3Utils = require("web3-utils");

const SmartContract = require("../smartcontract");

const GAS_ORACLE = 500000;
const GAS_COMPUTE_AMOUNT = 200000;
const GAS_ETH2TOKEN = 600000;
const GAS_TOKEN2ETH = 800000;
const GAS_TOKEN2TOKEN = 1000000;
const GAS_TOKEN2TOKEN2ETH = 1200000;
const GAS_CUSHION = 100000;
const CETH = "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";

class Liquidator extends SmartContract {
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
  liquidate(borrower, repayCToken, seizeCToken, amount, gasPrice) {
    const hexAmount = Web3Utils.toHex(amount.toFixed(0));
    const method = this._inner.methods.liquidate(
      borrower,
      repayCToken,
      seizeCToken,
      hexAmount
    );
    const gasLimit = this._estimateGas(repayCToken, seizeCToken, false, false);
    return this.txFor(method, gasLimit, gasPrice);
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
    // TODO we cheat here by just estimating gas for first candidate since
    // that's all that TxManager cares about at the moment.
    const gasLimit =
      cTokens.length >= 2
        ? this._estimateGas(repayCTokens[0], seizeCTokens[0])
        : Big(100000);

    return this._txFor(method, gasLimit, gasPrice);
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
    // TODO we cheat here by just estimating gas for first candidate since
    // that's all that TxManager cares about at the moment.
    const gasLimit =
      cTokens.length >= 2
        ? this._estimateGas(repayCTokens[0], seizeCTokens[0], true)
        : Big(100000);

    return this._txFor(method, gasLimit, gasPrice);
  }

  _combineTokens(repayList, seizeList) {
    let cTokens = [];
    for (let i = 0; i < repayList.length; i++)
      cTokens.push(repayList[i], seizeList[i]);
    return cTokens;
  }

  _estimateGas(
    repayCToken,
    seizeCToken,
    postPrices = false,
    solveAmount = true
  ) {
    let gas = Big(GAS_CUSHION);

    // NOTE: we assume everything is lowercase when comparing addresses
    if (repayCToken === CETH) gas = gas.plus(GAS_ETH2TOKEN);
    else if (seizeCToken === CETH) gas = gas.plus(GAS_TOKEN2ETH);
    // TODO The following conditional should really have an `or` clause to account
    // for cases where Uniswap has sufficient liquidity to go straight from repay
    // to seize without using Eth as an intermediate, but that's difficult to compute
    else if (repayCToken === seizeCToken) gas = gas.plus(GAS_TOKEN2TOKEN);
    else gas = gas.plus(GAS_TOKEN2TOKEN2ETH);

    if (postPrices) gas = gas.plus(GAS_ORACLE);
    if (solveAmount) gas = gas.plus(GAS_COMPUTE_AMOUNT);

    return gas;
  }
}

const addresses = {
  mainnet: "0x5ea500b3909e29718D6DCa18f953e18fCB943767",
  ropsten: "0x436E8869Ed1aC2e10E9860EF47479dAE66E2B6Ed"
};

for (let net in addresses) {
  const abi = require(`../abis/${net}/goldenage/liquidator.json`);
  exports[net] = new Liquidator(addresses[net], abi);
}

const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Web3Utils = require("web3-utils");

const SmartContract = require("../smartcontract");

const GAS_ORACLE = 600000;
const GAS_COMPUTE_AMOUNT = 200000;
const GAS_ETH2TOKEN = 600000;
const GAS_TOKEN2ETH = 700000;
const GAS_TOKEN2TOKEN = 800000;
const GAS_TOKEN2TOKEN2ETH = 1200000;
const GAS_CUSHION = 500000;
const GAS_V2_PENALTY = 300000;
const V2S = [
  "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
  "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9",
  "0x35a18000230da775cac24873d00ff85bccded550",
  "0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4",
];
const CETH = "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5";

class Liquidator extends SmartContract {
  liquidateSNWithPrice(
    messages,
    signatures,
    symbols,
    borrowers,
    repayCTokens,
    seizeCTokens,
    chi = false
  ) {
    const cTokens = this._combineTokens(repayCTokens, seizeCTokens);
    let method = chi
      ? this._inner.methods.liquidateSNWithPriceChi
      : this._inner.methods.liquidateSNWithPrice;
    method = method(messages, signatures, symbols, borrowers, cTokens);
    // TODO we cheat here by just estimating gas for first candidate since
    // that's all that TxManager cares about at the moment.
    const gasLimit = this._estimateGas(repayCTokens[0], seizeCTokens[0], true);
    return this._txFor(method, gasLimit);
  }

  /**
   * Performs liquidation on multiple accounts (SEND -- uses gas)
   *
   * @param {Array<String>} borrowers addresses of users with negative liquidity
   * @param {Array<String>} repayCTokens address of token to repay
   * @param {Array<String>} seizeCTokens address of token to seize
   * @return {Object} the transaction object
   */
  liquidateSN(borrowers, repayCTokens, seizeCTokens, chi = false) {
    const cTokens = this._combineTokens(repayCTokens, seizeCTokens);
    let method = chi
      ? this._inner.methods.liquidateSNChi
      : this._inner.methods.liquidateSN;
    method = method(borrowers, cTokens);
    // TODO we cheat here by just estimating gas for first candidate since
    // that's all that TxManager cares about at the moment.
    const gasLimit = this._estimateGas(repayCTokens[0], seizeCTokens[0]);
    return this._txFor(method, gasLimit);
  }

  liquidateSWithPrice(
    messages,
    signatures,
    symbols,
    borrower,
    repayCToken,
    seizeCToken,
    chi = false
  ) {
    let method = chi
      ? this._inner.methods.liquidateSWithPriceChi
      : this._inner.methods.liquidateSWithPrice;
    method = method(
      messages,
      signatures,
      symbols,
      borrower,
      repayCToken,
      seizeCToken
    );
    const gasLimit = this._estimateGas(repayCToken, seizeCToken, true);
    return this._txFor(method, gasLimit);
  }

  liquidateS(borrower, repayCToken, seizeCToken, chi = false) {
    let method = chi
      ? this._inner.methods.liquidateSChi
      : this._inner.methods.liquidateS;
    method = method(borrower, repayCToken, seizeCToken);
    const gasLimit = this._estimateGas(repayCToken, seizeCToken);
    return this._txFor(method, gasLimit);
  }

  /**
   * Performs liquidation (SEND -- uses gas)
   *
   * @param {string} borrower address of any user with negative liquidity
   * @param {string} repayCToken address of token to repay
   * @param {string} seizeCToken address of token to seize
   * @param {Big} amount debt to repay, in units of the ordinary asset
   * @return {Promise<Object>} the transaction object
   */
  liquidate(borrower, repayCToken, seizeCToken, amount) {
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

    if (V2S.includes(repayCToken) || V2S.includes(seizeCToken)) gas = gas.plus(GAS_V2_PENALTY);
    if (postPrices) gas = gas.plus(GAS_ORACLE);
    if (solveAmount) gas = gas.plus(GAS_COMPUTE_AMOUNT);

    return gas;
  }
}

const addresses = {
  mainnet: "0x5eA500DF65f2486655b57B691a626E6822A799e9",
  ropsten: "0x1D04779c62BE3484e8005C532750EE475a35949e"
};

for (let net in addresses) {
  const abi = require(`../abis/${net}/goldenage/liquidator.json`);
  exports[net] = new Liquidator(addresses[net], abi);
}

const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Contract = require("../smartcontract");
const COMPTROLLERABI = require("../abis/compound/comptroller.json");

class Comptroller extends Contract {
  /**
   * Enters the markets corresponding to cTokens (SEND -- uses gas)
   * Markets must be entered before a user can supply/borrow
   *
   * @param {Array} cTokens an array of type Token (specifies the markets to enter)
   * @param {Number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  enterMarketsFor(cTokens, gasPrice) {
    const encodedMethod = this.contract.methods
      .enterMarkets(cTokens.map(x => x.address))
      .encodeABI();
    return this.txFor(encodedMethod, "300000", gasPrice);
  }

  /**
   * Opposite of enterMarketsFor (SEND -- uses gas)
   *
   * @param {CToken} cToken specifies the market to exit
   * @param {Number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  exitMarketFor(cToken, gasPrice) {
    const encodedMethod = this.contract.methods
      .exitMarket(cToken.address)
      .encodeABI();
    return this.txFor(encodedMethod, "300000", gasPrice);
  }

  /**
   * Figures out which markets the wallet is participating in
   *
   * @param {string} wallet account address of any user
   * @return {Array.<String>} the addresses of the cToken contracts
   */
  async marketsEnteredBy(wallet) {
    return await this.contract.methods.getAssetsIn(wallet).call();
  }

  /**
   * Gets the percentage of supplied value that can be borrowed
   *
   * @param {CToken} cToken specifies the market to query
   * @return {Number} the collateral factor
   */
  async collateralFactorFor(cToken) {
    const result = await this.contract.methods.markets(cToken.address).call();
    const { 0: isListed, 1: collateralFactorMantissa } = result;
    return Big(collateralFactorMantissa).div(1e18);
  }

  /**
   * Gets the total value (in Eth) that an account could borrow  
   * `liquidity = (supply_balances .* collateral_factors) .- borrow_balances`
   *
   * @param {String} borrower account address of any user
   * @return {Array} tuple (liquidity, shortfall) or null on error
   */
  async accountLiquidityOf(borrower) {
    const result = await this.contract.methods
      .getAccountLiquidity(borrower)
      .call();
    // error is 0 on success
    // liquidity is nonzero if borrower can borrow more
    // shortfall is nonzero if borrower can be liquidated
    const { 0: error, 1: liquidity, 2: shortfall } = result;
    if (error !== "0") return null;
    return [Big(liquidity).div(1e18), Big(shortfall).div(1e18)]; // TODO 18 or 19?
  }

  /**
   * The percent (0 -> 1) of a liquidatable account's borrow that can be repaid in a single transaction
   * If a user has multiple borrowed assets, the closeFactor applies to any single asset
   * (not the aggregate borrow balance)
   *
   * @return {Number} the close factor
   */
  async closeFactor() {
    return Big(await this.contract.methods.closeFactorMantissa().call()).div(
      1e18
    );
  }

  /**
   * A number (should be slightly > 1) indicating how much additional collateral is given to liquidators
   * For example, if incentive is 1.1, liquidators receive an extra 10% of the borrower's collateral
   * for every unit they close
   *
   * @return {Number} the liquidation incentive
   */
  async liquidationIncentive() {
    return Big(
      await this.contract.methods.liquidationIncentiveMantissa().call()
    ).div(1e18);
  }
}

exports.Comptroller = Comptroller;
exports.mainnet = new Comptroller(
  "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b",
  COMPTROLLERABI
);

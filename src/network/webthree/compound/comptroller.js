const Contract = require("../smartcontract");
const COMPTROLLERABI = require("../abis/compound/comptroller.json");

class Comptroller extends Contract {
  enterMarketsFor(cTokens) {
    /**
     * Enters the markets corresponding to cTokens (SEND -- uses gas)
     * Markets must be entered before a user can supply/borrow
     * 
     * @param {Array} cTokens an array of type Token (specifies the markets to enter)
     * @return {Object} the transaction object
     */
    const encodedMethod = this.contract.methods
      .enterMarkets(cTokens.map(x => x.address))
      .encodeABI();
    return this.txFor(encodedMethod, 300000, 3 * 1e9);
  }

  exitMarketFor(cToken) {
    /**
     * Opposite of enterMarketsFor (SEND -- uses gas)
     * 
     * @param {CToken} cToken specifies the market to exit
     * @return {Object} the transaction object
     */
    const encodedMethod = this.contract.methods
      .exitMarket(cToken.address)
      .encodeABI();
    return this.txFor(encodedMethod, 300000, 3 * 1e9);
  }

  async marketsEnteredBy(wallet) {
    /**
     * Figures out which markets the wallet is participating in
     * 
     * @param {string} wallet account address of any user
     * @return {Array} the addresses of the cToken contracts
     */
    return await this.contract.methods.getAssetsIn(wallet).call();
  }

  async collateralFactorFor(cToken) {
    /**
     * Gets the percentage of supplied value that can be borrowed
     * 
     * @param {CToken} cToken specifies the market to query
     * @return {Number} the collateral factor
     */
    const result = await this.contract.methods.markets(cToken.address).call();
    const { 0: isListed, 1: collateralFactorMantissa } = result;
    return collateralFactorMantissa / 1e18;
  }

  async accountLiquidityOf(borrower) {
    /**
     * Gets the total value (in Eth) that an account could borrow
     * liquidity = (supply_balances .* collateral_factors) .- borrow_balances
     * 
     * @param {string} borrower account address of any user
     * @return {Array} tuple (liquidity, shortfall)
     */
    const result = await this.contract.methods
      .getAccountLiquidity(borrower)
      .call();
    // error is 0 on success
    // liquidity is nonzero if borrower can borrow more
    // shortfall is nonzero if borrower can be liquidated
    const { 0: error, 1: liquidity, 2: shortfall } = result;
    return [liquidity / 1e18, shortfall / 1e18];// TODO 18 or 19?
  }

  async closeFactor() {
    /**
     * The percent (0 -> 1) of a liquidatable account's borrow that can be repaid in a single transaction
     * If a user has multiple borrowed assets, the closeFactor applies to any single asset
     * (not the aggregate borrow balance)
     * 
     * @return {Number} the close factor
     */
    return (await this.contract.methods.closeFactorMantissa().call()) / 1e18;
  }

  async liquidationIncentive() {
    /**
     * A number (should be slightly > 1) indicating how much additional collateral is given to liquidators
     * For example, if incentive is 1.1, liquidators receive an extra 10% of the borrower's collateral
     * for every unit they close
     * 
     * @return {Number} the liquidation incentive
     */
    return (
      (await this.contract.methods.liquidationIncentiveMantissa().call()) / 1e18
    );
  }
}

exports.Comptroller = Comptroller;
exports.mainnet = new Comptroller(
  "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b",
  COMPTROLLERABI
);

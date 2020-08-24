const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const SmartContract = require("../smartcontract");

class Comptroller extends SmartContract {
  /**
   * Figures out which markets the wallet is participating in
   *
   * @param {string} wallet account address of any user
   * @return {function(provider, Number?): Promise<Array<String>>} the addresses of the cToken contracts
   */
  marketsEnteredBy(wallet) {
    const method = this._inner.methods.getAssetsIn(wallet);
    return this._callerFor(method, ["address[]"], x => x["0"]);
  }

  /**
   * Gets the percentage of supplied value that can be borrowed
   *
   * @param {CToken} cToken specifies the market to query
   * @return {function(provider, Number?): Promise<Big>} the collateral factor
   */
  collateralFactorFor(cToken) {
    const method = this._inner.methods.markets(cToken.address);
    return this._callerFor(method, ["bool", "uint256"], res => {
      const { 0: isListed, 1: collateralFactorMantissa } = res;
      return Big(collateralFactorMantissa).div(1e18);
    });
  }

  /**
   * Gets the total value (in Eth) that an account could borrow
   * `liquidity = (supply_balances .* collateral_factors) .- borrow_balances`
   *
   * @param {String} borrower account address of any user
   * @return {function(provider, Number?): Promise<Array<Big>?>} tuple (liquidity, shortfall) or null on error
   */
  accountLiquidityOf(borrower) {
    const method = this._inner.methods.getAccountLiquidity(borrower);
    return this._callerFor(method, ["uint256", "uint256", "uint256"], res => {
      const { 0: error, 1: liquidity, 2: shortfall } = res;
      if (error !== "0") return null;
      return [Big(liquidity).div(1e18), Big(shortfall).div(1e18)];
    });
  }

  /**
   * The percent (0 -> 1) of a liquidatable account's borrow that can be repaid in a single transaction
   * If a user has multiple borrowed assets, the closeFactor applies to any single asset
   * (not the aggregate borrow balance)
   *
   * @return {function(provider, Number?): Promise<Big>} the close factor
   */
  closeFactor() {
    const method = this._inner.methods.closeFactorMantissa();
    return this._callerForUint256(method, x => x.div(1e18));
  }

  /**
   * A number (should be slightly > 1) indicating how much additional collateral is given to liquidators
   * For example, if incentive is 1.1, liquidators receive an extra 10% of the borrower's collateral
   * for every unit they close
   *
   * @return {function(provider, Number?): Promise<Big>} the liquidation incentive
   */
  liquidationIncentive() {
    const method = this._inner.methods.liquidationIncentiveMantissa();
    return this._callerForUint256(method, x => x.div(1e18));
  }
}

const addresses = {
  mainnet: "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b",
  ropsten: "0x54188bBeDD7b68228fa89CbDDa5e3e930459C6c6"
};

for (let net in addresses) {
  const abi = require(`../abis/${net}/compound/comptroller.json`);
  exports[net] = new Comptroller(addresses[net], abi);
}

import Big from "../../../big";
import SmartContract from "../smartcontract";
import { EthNet, MultiEthNet } from "../ethnet";
import { staticImplements } from "../../../utils";

const addresses = {
  [EthNet.mainnet]: "0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b",
  [EthNet.ropsten]: "0x54188bBeDD7b68228fa89CbDDa5e3e930459C6c6"
};

// Cache the abi json files in memory at import time to avoid I/O during runtime
const abiMap: Map<EthNet, any> = new Map();
for (let network in addresses) {
  let ethnet: EthNet = EthNet[network as keyof typeof EthNet];
  abiMap.set(ethnet, require(`../abis/${network}/compound/comptroller.json`));
}

@staticImplements<MultiEthNet>()
export default class Comptroller extends SmartContract {

  /**
   * Factory method for constructing an instance of Comptroller on a given
   * Ethereum network.
   * @param network - the network (mainnet or a testnet) to build on.
   */
  public static forNet(network: EthNet): Comptroller {
    const abi: any = abiMap.get(network);
    return new Comptroller(addresses[network], abi);
  }

  /**
   * Figures out which markets the wallet is participating in
   *
   * @param {string} wallet account address of any user
   * @return {function(provider, Number?): Promise<Array<String>>} the addresses of the cToken contracts
   */
  marketsEnteredBy(wallet) {
    const method = this.inner.methods.getAssetsIn(wallet);
    return this._callerFor(method, ["address[]"], x => x["0"]);
  }

  /**
   * Gets the percentage of supplied value that can be borrowed
   *
   * @param {CToken} cToken specifies the market to query
   * @return {function(provider, Number?): Promise<Big>} the collateral factor
   */
  collateralFactorFor(cToken) {
    const method = this.inner.methods.markets(cToken.address);
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
    const method = this.inner.methods.getAccountLiquidity(borrower);
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
    const method = this.inner.methods.closeFactorMantissa();
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
    const method = this.inner.methods.liquidationIncentiveMantissa();
    return this._callerForUint256(method, x => x.div(1e18));
  }
}

const Contract = require('../Contract.js');
const COMPTROLLERABI = require('./abis/comptroller.json');

class Comptroller extends Contract {
  // Enters the markets corresponding to cTokens (SEND -- uses gas)
  // Markets must be entered before a user can supply/borrow
  // cTokens: an array of type Token (specifies the markets to enter)
  // withWallet: the wallet that will enter the market
  async enterMarketsFor(cTokens, withWallet) {
    const encodedMethod = this.contract.methods.enterMarkets(cTokens.map((x) => x.address)).encodeABI();

    const tx = await this.txFor(encodedMethod, withWallet, 300000, 3 * 1e9);
    const signedTx = this.sign(tx);
    this.send(signedTx, 'Comptroller.enterMarketsFor');
  }

  // Opposite of enterMarketsFor (SEND -- uses gas)
  // cToken: type Token (specifies the market to exit)
  // withWallet: the wallet that will exit the market
  async exitMarketFor(cToken, withWallet) {
    const encodedMethod = this.contract.methods.exitMarket(cToken.address).encodeABI();

    const tx = await this.txFor(encodedMethod, withWallet, 300000, 3 * 1e9);
    const signedTx = this.sign(tx);
    this.send(signedTx, 'Comptroller.exitMarketFor');
  }

  // Returns an array containing the addresses of the cToken contracts that the wallet is participating in
  // wallet: account address of any user
  async marketsEnteredBy(wallet) {
    return (await this.contract.methods.getAssetsIn(wallet).call());
  }

  // Returns the percentage of supplied value that can be borrowed in a given market
  // cToken: type Token (specifies market to query for collateral factor)
  async collateralFactorFor(cToken) {
    const result = await this.contract.methods.markets(cToken.address).call();
    const {0: isListed, 1: collateralFactorMantissa} = result;
    return collateralFactorMantissa / 1e18;
  }

  // Returns the total estimated value (in Ether) that an account could borrow
  // liquidity = (supply_balances .* collateral_factors) .- borrow_balances
  // borrower: account address of any user
  async accountLiquidityOf(borrower) {
    const result = await this.contract.methods.getAccountLiquidity(borrower).call();
    // error is 0 on success
    // liquidity is nonzero if borrower can borrow more
    // shortfall is nonzero if borrower can be liquidated
    const {0: error, 1: liquidity, 2: shortfall} = result;
    return [liquidity / 1e18, shortfall / 1e18];
  }

  // Returns the percent (0 -> 1) of a liquidatable account's borrow that can be repaid in a single transaction
  // If a user has multiple borrowed assets, the closeFactor applies to any single asset
  // (not the aggregate borrow balance)
  async closeFactor() {
    return (await this.contract.methods.closeFactorMantissa().call()) / 1e18;
  }

  // Returns a number (should be slightly > 1) indicating how much additional collateral is given to liquidators
  // For example, if incentive is 1.1, liquidators receive an extra 10% of the borrower's collateral
  // for every unit they close
  async liquidationIncentive() {
    return (await this.contract.methods.liquidationIncentiveMantissa().call()) / 1e18;
  }
}

exports.Comptroller = Comptroller;
exports.mainnet = new Comptroller(
  '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b',
  COMPTROLLERABI,
);
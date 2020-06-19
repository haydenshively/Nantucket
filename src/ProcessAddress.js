// Compound
const Tokens = require('./compound/Tokens.js');
// const Comptroller = require('./compound/Comptroller.js');

exports.possiblyLiquidate = (
  account,// from AccountService API
  closeFactor,
  liquidationIncentive,
  gasPrices,// in wei
  cTokenUnderlyingPrices_Eth,// from CTokenService API
  myBalances) => {

  const address = account.address;
  const health = account.health ? account.health.value : 100.0;
  if (health > 1.0) return 0.0;
  // if (health > 0.99) {
  //   const [ liquidity, shortfall ] = await Comptroller.mainnet.accountLiquidityOf(address);
  //   if (liquidity > 0.0) return 0.0;
  // }
  // console.log('Log @process: Analyzing Account');
  // console.log('--> Address: ' + address);
  // console.log('--> Health: ' + health);

  let bestAssetToClose = null;
  let bestAssetToSeize = null;
  let closingAmountEth_borrow = 0.0;
  let closingAmountEth_supply = 0.0;

  const tokens = (account.tokens) ? account.tokens : [];
  // console.log('Log @process: Searching for best asset to close');
  tokens.forEach((token) => {
    // const tokenAddress = token.address;
    const tokenSymbol = token.symbol;
    // console.log('--> Token ' + tokenSymbol);

    const borrow_uUnits = (token.borrow_balance_underlying) ? token.borrow_balance_underlying.value : 0.0;
    if (borrow_uUnits > 0) {
      // console.log('----> Borrow (in uUnits): ' + borrow_uUnits);
      const borrow_Eth = borrow_uUnits * cTokenUnderlyingPrices_Eth[tokenSymbol];
      // console.log('----> Borrow (in Eth): ' + borrow_Eth);
      let closable_Eth = borrow_Eth * closeFactor;
      // console.log('------> Closable by Market (in Eth): ' + closable_Eth);
      // Assumes that all cTokens are named like xUND, where x is any letter and UND is the
      // symbol of the underlying asset
      const exchangeRate = cTokenUnderlyingPrices_Eth[tokenSymbol] ? cTokenUnderlyingPrices_Eth[tokenSymbol] : 0.0;
      const mine = myBalances[tokenSymbol.substring(1)] ? myBalances[tokenSymbol.substring(1)] : 0.0;
      closable_Eth = Math.min(closable_Eth, mine * exchangeRate);
      // console.log('------> Closable by Me (in Eth):     ' + closable_Eth);

      if (closable_Eth > closingAmountEth_borrow) {
        // console.log('****> Now the winner!');
        closingAmountEth_borrow = closable_Eth;
        bestAssetToClose = token;
      }
    }
  });

  if (bestAssetToClose === null) return 0.0;
  // if (bestAssetToClose.symbol === 'cETH') return 0.0;// TODO something is broken here

  // console.log('Log @process: Searching for best asset to seize');
  tokens.forEach((token) => {
    // const tokenAddress = token.address;
    const tokenSymbol = token.symbol;
    // console.log('--> Token ' + tokenSymbol);

    const supply_uUnits = (token.supply_balance_underlying) ? token.supply_balance_underlying.value : 0.0;
    if (supply_uUnits > 0) {
      // console.log('----> Supply (in uUnits): ' + supply_uUnits);
      const supply_Eth = supply_uUnits * cTokenUnderlyingPrices_Eth[tokenSymbol];
      // console.log('----> Supply (in Eth): ' + supply_Eth);
      const closable_Eth = supply_Eth / liquidationIncentive;
      // console.log('------> Seizable by Market (in Eth): ' + closable_Eth);

      // Aim to seize the token with the smallest sufficient balance
      if ((closable_Eth > closingAmountEth_borrow) && (closingAmountEth_supply > closingAmountEth_borrow)) {
        if (closable_Eth < closingAmountEth_supply) {
          // Make sure we don't try to seize the thing that we're closing (otherwise Compound throws re-entrancy)
          if (token !== bestAssetToClose) {
            // console.log('****> Now the winner!');
            closingAmountEth_supply = closable_Eth;
            bestAssetToSeize = token;
          }
        }
      }
      else if (closable_Eth > closingAmountEth_supply) {
        // Make sure we don't try to seize the thing that we're closing (otherwise Compound throws re-entrancy)
        if (token !== bestAssetToClose) {
          // console.log('****> Now the winner!');
          closingAmountEth_supply = closable_Eth;
          bestAssetToSeize = token;
        }
      }
    }
  });

  if (bestAssetToSeize === null) return 0.0;

  const closingAmount_Eth = Math.min(closingAmountEth_borrow, closingAmountEth_supply);
  // console.log('Log @process: Found best possible close/seize combination');
  // console.log('--> Should liquidate ' + bestAssetToClose.symbol);
  // console.log('----> Amount (in Eth): ' + closingAmount_Eth);
  // console.log('--> Should seize ' + bestAssetToSeize.symbol);

  const expectedRevenue = closingAmount_Eth * (liquidationIncentive - 1.0);
  // console.log(account.address.toString() + ' - ' + expectedRevenue.toString());
  // console.log('Log @process: Potential profit is ' + expectedRevenue + ' ETH');
  for (const gasPrice of gasPrices) {
    const maxGasMaintainingProfit = expectedRevenue / (gasPrice / 1e18);
    // TODO parameterize this threshold
    if (maxGasMaintainingProfit > 500000) {
      let symbolClose = bestAssetToClose.symbol;
      symbolClose = symbolClose.charAt(0).toLowerCase() + symbolClose.substring(1);
      const closingAmount_uUnits = closingAmount_Eth / cTokenUnderlyingPrices_Eth[bestAssetToClose.symbol];

      console.log(account.address.toString() + '-' + expectedRevenue.toString());
      Tokens.mainnet[symbolClose].liquidate_uUnits(
        address,
        closingAmount_uUnits,
        bestAssetToSeize.address,
        process.env.PUBLIC_KEY,
        gasPrice,
      );
      return expectedRevenue;
    }
  }
  return 0.0;
};

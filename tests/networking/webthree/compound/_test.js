require('dotenv').config();
const { performance } = require('perf_hooks');
const Tokens = require('./Tokens.js');
const Comptroller = require('./Comptroller.js');

let t0;

t0 = performance.now();
Tokens.mainnet.cDAI.exchangeRate().then((result) => {
  console.log('cDAI Exchange Rate: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Tokens.mainnet.cDAI.borrowRate().then((result) => {
  console.log('cDAI Borrow Rate: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Tokens.mainnet.cDAI.supplyRate().then((result) => {
  console.log('cDAI Supply Rate: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Tokens.mainnet.cDAI.cUnitsInCirculation().then((result) => {
  console.log('cDAI In Circulation: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Tokens.mainnet.cDAI.uUnitsInContract().then((result) => {
  console.log('DAI In Contract: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Tokens.mainnet.cDAI.uUnitsLoanedOut().then((result) => {
  console.log('DAI Gross Borrow: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Tokens.mainnet.cDAI.uUnitsInContractFor(process.env.PUBLIC_KEY).then((result) => {
    console.log('Hayden\'s Supplied Dai: call took ' + (performance.now() - t0) + ' milliseconds');
    console.log(result);
    console.log('');
});
t0 = performance.now();
Tokens.mainnet.cDAI.uUnitsLoanedOutTo(process.env.PUBLIC_KEY).then((result) => {
    console.log('Hayden\'s Borrowed Dai: call took ' + (performance.now() - t0) + ' milliseconds');
    console.log(result);
    console.log('');
});

// Tokens.mainnet.cDAI.uUnitsLoanedOutTo(accountToLiquidate).then((uUnitsLoaned) => {
//   Comptroller.mainnet.closeFactor().then((closeFactor) => {
//     maxLiquidation = uUnitsLoaned*(closeFactor - 0.1);
//     console.log('Max Liquidation: ' + maxLiquidation.toString());
//     Tokens.mainnet.cDAI.liquidate_uUnits(accountToLiquidate, maxLiquidation, Tokens.mainnet.cETH.address, process.env.PUBLIC_KEY);
//   });
// });
// Tokens.mainnet.cDAI.withdraw_uUnits(1, process.env.PUBLIC_KEY);
// Tokens.mainnet.cDAI.supply_uUnits(1, process.env.PUBLIC_KEY);
// Tokens.mainnet.cDAI.liquidate_uUnits('0xa62fdc2b9e7e64bc9e8e39aeba4e4fb4cca58aec',1e-16, Tokens.mainnet.cDAI.address, process.env.PUBLIC_KEY);

t0 = performance.now();
Comptroller.mainnet.liquidationIncentive().then((result) => {
  console.log('Compound Liquidation Incentive: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Comptroller.mainnet.closeFactor().then((result) => {
  console.log('Compound Close Factor: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Comptroller.mainnet.collateralFactorFor(Tokens.mainnet.cDAI).then((result) => {
  console.log('cDAI Collateral Factor: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Comptroller.mainnet.marketsEnteredBy(process.env.PUBLIC_KEY).then((result) => {
  console.log('Hayden\'s Active Markets: call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});
t0 = performance.now();
Comptroller.mainnet.accountLiquidityOf(process.env.PUBLIC_KEY).then((result) => {
  console.log('Hayden\'s Account Liquidity and Shortfall (in Eth): call took ' + (performance.now() - t0) + ' milliseconds');
  console.log(result);
  console.log('');
});

// Comptroller.mainnet.enterMarketsFor([
//   Tokens.mainnet.cBAT,
//   Tokens.mainnet.cREP,
//   Tokens.mainnet.cSAI,
//   Tokens.mainnet.cZRX,
//   Tokens.mainnet.cWBTC,
//   Tokens.mainnet.cETH,
// ], process.env.PUBLIC_KEY);

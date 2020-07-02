// let t0;

// t0 = performance.now();
// Tokens.mainnet.cDAI.exchangeRate().then((result) => {
//   console.log('cDAI Exchange Rate: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Tokens.mainnet.cDAI.borrowRate().then((result) => {
//   console.log('cDAI Borrow Rate: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Tokens.mainnet.cDAI.supplyRate().then((result) => {
//   console.log('cDAI Supply Rate: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Tokens.mainnet.cDAI.cUnitsInCirculation().then((result) => {
//   console.log('cDAI In Circulation: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Tokens.mainnet.cDAI.uUnitsInContract().then((result) => {
//   console.log('DAI In Contract: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Tokens.mainnet.cDAI.uUnitsLoanedOut().then((result) => {
//   console.log('DAI Gross Borrow: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Tokens.mainnet.cDAI.uUnitsInContractFor(process.env.PUBLIC_KEY).then((result) => {
//     console.log('Hayden\'s Supplied Dai: call took ' + (performance.now() - t0) + ' milliseconds');
//     console.log(result);
//     console.log('');
// });
// t0 = performance.now();
// Tokens.mainnet.cDAI.uUnitsLoanedOutTo(process.env.PUBLIC_KEY).then((result) => {
//     console.log('Hayden\'s Borrowed Dai: call took ' + (performance.now() - t0) + ' milliseconds');
//     console.log(result);
//     console.log('');
// });

// // Tokens.mainnet.cDAI.uUnitsLoanedOutTo(accountToLiquidate).then((uUnitsLoaned) => {
// //   Comptroller.mainnet.closeFactor().then((closeFactor) => {
// //     maxLiquidation = uUnitsLoaned*(closeFactor - 0.1);
// //     console.log('Max Liquidation: ' + maxLiquidation.toString());
// //     Tokens.mainnet.cDAI.liquidate_uUnits(accountToLiquidate, maxLiquidation, Tokens.mainnet.cETH.address, process.env.PUBLIC_KEY);
// //   });
// // });
// // Tokens.mainnet.cDAI.withdraw_uUnits(1, process.env.PUBLIC_KEY);
// // Tokens.mainnet.cDAI.supply_uUnits(1, process.env.PUBLIC_KEY);
// // Tokens.mainne

require("dotenv").config();

const assert = require("assert");

const Web3 = require("web3");
if (process.env.WEB3_PROVIDER.endsWith(".ipc")) {
  net = require("net");
  global.web3 = new Web3(process.env.WEB3_PROVIDER_TEST, net);
} else {
  global.web3 = new Web3(process.env.WEB3_PROVIDER_TEST);
}
const Comptroller = require("../../../../src/network/webthree/compound/comptroller");

describe("Compound Comptroller Test", () => {
  it("should retrieve liquidation incentive", () => {
    return Comptroller.mainnet.liquidationIncentive().then(result => {
      assert(result > 1.0);
    });

    
  });
});

after(async () => {
  web3.currentProvider.connection.close();
});

// t0 = performance.now();
// Comptroller.mainnet.liquidationIncentive().then((result) => {
//   console.log('Compound Liquidation Incentive: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Comptroller.mainnet.closeFactor().then((result) => {
//   console.log('Compound Close Factor: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Comptroller.mainnet.collateralFactorFor(Tokens.mainnet.cDAI).then((result) => {
//   console.log('cDAI Collateral Factor: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Comptroller.mainnet.marketsEnteredBy(process.env.PUBLIC_KEY).then((result) => {
//   console.log('Hayden\'s Active Markets: call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });
// t0 = performance.now();
// Comptroller.mainnet.accountLiquidityOf(process.env.PUBLIC_KEY).then((result) => {
//   console.log('Hayden\'s Account Liquidity and Shortfall (in Eth): call took ' + (performance.now() - t0) + ' milliseconds');
//   console.log(result);
//   console.log('');
// });

// // Comptroller.mainnet.enterMarketsFor([
// //   Tokens.mainnet.cBAT,
// //   Tokens.mainnet.cREP,
// //   Tokens.mainnet.cSAI,
// //   Tokens.mainnet.cZRX,
// //   Tokens.mainnet.cWBTC,
// //   Tokens.mainnet.cETH,
// // ], process.env.PUBLIC_KEY);

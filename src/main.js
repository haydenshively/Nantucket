// Project Level
require('dotenv').config();
// Compound
const Tokens = require('./compound/Tokens.js');
const Comptroller = require('./compound/Comptroller.js');
const Compound = require('./compound/API.js');
// Chain
// const Etherscan = require('./chain/Etherscan.js');
const Ethplorer = require('./chain/Ethplorer.js');
const GasStation = require('./chain/GasStation.js');
// Scripting
const ProcessAddress = require('./ProcessAddress.js');

class Main {
  constructor() {
    this.accounts = [];
    this.closeFactor = 0.0;
    this.liquidationIncentive = 1.0;
    this.gasPrices = {};
    this.cTokenUnderlyingPrices_Eth = {};
    this.myBalances = {};

    this.accountsFetchingHandle = null;
    this.closeFactorFetchingHandle = null;
    this.liquidationIncentiveFetchingHandle = null;
    this.gasFetchingHandle = null;
    this.cTokenUnderlyingFetchingHandle = null;
    this.myBalancesFetchingHandle = null;
    this.riskyFetchingHandler = null;
  }

  startFetchingAccounts(timeout) {
    this.accountsFetchingHandle = setInterval(
      () => {
        this.stopFetchingRiskyLiquidities();
        Compound.fetchAccounts(1.1).then((result) => {
          //console.log('Updated Accounts');
          //console.log('');
          const addresses = this.accounts.map(a => a.address);
          let toAppend = [];
          for (let i = 0; i < result.length; i++) {
            if (!addresses.includes(result[i].address)) {
              toAppend.push(result[i]);
            }
          }
          this.accounts = this.accounts.concat(toAppend);
          this.onGotNewData();
          this.startFetchingRiskyLiquidities();
        });
      },
      timeout,
    );
  }

  stopFetchingAccounts() {
    if (this.accountsFetchingHandle) clearInterval(this.accountsFetchingHandle);
  }

  startFetchingRiskyLiquidities() {
    this.riskyFetchingHandler = setInterval(
      async () => {
        try {
          //console.log('Double checking liquidity with Comptroller:');

          for (let i = 0; i < this.accounts.length; i++) {
            if (this.accounts[i]['liquidated']) continue;
            if ((this.accounts[i].health) && (this.accounts[i].health.value > 1.0)) continue;

            const [liquidity, shortfall] = await Comptroller.mainnet.accountLiquidityOf(this.accounts[i].address);
            if (liquidity > 0) continue;
            if (shortfall > 0) {
              this.accounts[i].health.value = 0.999;

              for (let key of Object.keys(this.accounts[i].tokens)) {
                let symbol = this.accounts[i].tokens[key].symbol;
                symbol = symbol.charAt(0).toLowerCase() + symbol.substring(1);
                this.accounts[i].tokens[key].borrow_balance_underlying = {'value': await Tokens.mainnet[symbol].uUnitsLoanedOutTo(this.accounts[i].address)};
                this.accounts[i].tokens[key].supply_balance_underlying = {'value': await Tokens.mainnet[symbol].uUnitsInContractFor(this.accounts[i].address)};
              }

              const expectedRevenue = ProcessAddress.possiblyLiquidate(
                this.accounts[i],
                this.closeFactor,
                this.liquidationIncentive,
                this.gasPrices,
                this.cTokenUnderlyingPrices_Eth,
                this.myBalances,
              );
              if (expectedRevenue > 0) this.accounts[i]['liquidated'] = true;
            }
          }
        } catch(error) {
          console.log(error);
        }
      },
      90 * 1000,
    );
  }

  stopFetchingRiskyLiquidities() {
    if (this.riskyFetchingHandler) clearInterval(this.riskyFetchingHandler);
  }

  startFetchingCloseFactor(timeout) {
    this.closeFactorFetchingHandle = setInterval(
      () => {
        Comptroller.mainnet.closeFactor().then((result) => {
          if (this.closeFactor !== result) {
            //console.log('Close Factor Changed');
            //console.log('');
            this.closeFactor = result;
            this.onGotNewData();
          }
        });
      },
      timeout,
    );
  }

  stopFetchingCloseFactor() {
    if (this.closeFactorFetchingHandle) clearInterval(this.closeFactorFetchingHandle);
  }

  startFetchingLiquidationIncentive(timeout) {
    this.liquidationIncentiveFetchingHandle = setInterval(
      () => {
        Comptroller.mainnet.liquidationIncentive().then((result) => {
          if (this.liquidationIncentive !== result) {
            //console.log('Liquidation Incentive Changed');
            //console.log('');
            this.liquidationIncentive = result;
            this.onGotNewData();
          }
        });
      },
      timeout,
    );
  }

  stopFetchingLiquidationIncentive() {
    if (this.liquidationIncentiveFetchingHandle) clearInterval(this.liquidationIncentiveFetchingHandle);
  }

  startFetchingGasPrices(timeout) {
    this.gasFetchingHandle = setInterval(
      () => {
        GasStation.pricesHighToLow_wei().then((result) => {
          if (JSON.stringify(this.gasPrices) !== JSON.stringify(result)) {
            //console.log('Gas Prices Changed');
            //console.log(result);
            //console.log('');
            this.gasPrices = result;
            this.onGotNewData();
          }
        });
      },
      timeout,
    );
  }

  stopFetchingGasPrices() {
    if (this.gasFetchingHandle) clearInterval(this.gasFetchingHandle);
  }

  startFetchingCTokenUnderlying(timeout) {
    this.cTokenUnderlyingFetchingHandle = setInterval(
      () => {
        Compound.fetchCTokenUnderlyingPrices_Eth().then((result) => {
          if (JSON.stringify(this.cTokenUnderlyingPrices_Eth) !== JSON.stringify(result)) {
            //console.log('Token Prices Changed');
            //console.log(result);
            //console.log('');
            this.cTokenUnderlyingPrices_Eth = result;
            this.onGotNewData();
          }
        });
      },
      timeout,
    )
  }

  stopFetchingCTokenUnderlying() {
    if (this.cTokenUnderlyingFetchingHandle) clearInterval(this.cTokenUnderlyingFetchingHandle);
  }

  startFetchingMyBalances(timeout) {
    this.myBalancesFetchingHandle = setInterval(
      () => {
        Ethplorer.balancesFor(process.env.PUBLIC_KEY).then((result) => {
          if (JSON.stringify(this.myBalances) !== JSON.stringify(result)) {
            //console.log('My Balances Changed');
            //console.log(result);
            //console.log('');
            this.myBalances = result;
            this.onGotNewData();
          }
        });
      },
      timeout,
    )
  }

  stopFetchingMyBalances() {
    if (this.myBalancesFetchingHandle) clearInterval(this.myBalancesFetchingHandle);
  }

  onGotNewData() {
    for (let i = 0; i < this.accounts.length; i++) {
      if (this.accounts[i]['liquidated']) continue;
      const expectedRevenue = ProcessAddress.possiblyLiquidate(
        this.accounts[i],
        this.closeFactor,
        this.liquidationIncentive,
        this.gasPrices,
        this.cTokenUnderlyingPrices_Eth,
        this.myBalances,
      );
      if (expectedRevenue > 0) this.accounts[i]['liquidated'] = true;
    }
  }
}

const main = new Main();
main.startFetchingAccounts(4 * 60 * 1000);
main.startFetchingCloseFactor(2 * 60 * 1000);
main.startFetchingLiquidationIncentive(2 * 60 * 1000);
main.startFetchingGasPrices(60 * 1000);
main.startFetchingCTokenUnderlying(90 * 1000);
main.startFetchingMyBalances(5 * 60 * 1000);

// src.network.webthree
const Comptroller = require("./network/webthree/compound/comptroller");
const Tokens = require("./network/webthree/compound/ctoken");

class Candidate {
  constructor(dbUserEntry) {
    this.address = "0x" + dbUserEntry.address;
    this.ctokenidpay = dbUserEntry.ctokenidpay;
    this.ctokenidseize = dbUserEntry.ctokenidseize;
    this.profitability = dbUserEntry.profitability;

    this.label = this.address.slice(0, 6);
    this._markets = null;
  }

  async init() {
    let markets = []

    const addrs = await Comptroller.mainnet.marketsEnteredBy(this.address);
    for (let addr of addrs) {
      const token = Tokens.mainnetByAddr[addr.toLowerCase()];
      markets.push({
        address: addr,
        borrow_uUnits: await token.uUnitsBorrowedBy(this.address),
        supply_uUnits: await token.uUnitsSuppliedBy(this.address),
        collat: await Comptroller.mainnet.collateralFactorFor(token)
      });
    }

    this._markets = markets;
  }

  async liquidityOffChain(oracle) {
    if (this._markets === null) await this.init();

    let borrow = 0;
    let supply = 0;

    for (let market of this._markets) {
      const costInEth = await oracle.getPrice(market.address);
      if (costInEth === null) continue; 

      borrow += market.borrow_uUnits.times(costInEth);
      supply += market.supply_uUnits.times(costInEth).times(market.collat);
    }

    return supply - borrow;
  }

  liquidityOnChain() {
    return Comptroller.mainnet.accountLiquidityOf(this.address);
  }

  async isLiquidatable() {
    const liquidity = await this.liquidityOnChain();
    return liquidity !== null && liquidity[1].gt(0.0);
  }
}

module.exports = Candidate;

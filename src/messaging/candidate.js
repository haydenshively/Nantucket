const Message = require("./message");
// src.network.webthree
const Comptroller = require("../network/webthree/compound/comptroller");
const Tokens = require("../network/webthree/compound/ctoken");

class Candidate extends Message {
  constructor(data) {
    super();

    this.address = data.address;
    this.ctokenidpay = data.ctokenidpay;
    this.ctokenidseize = data.ctokenidseize;
    this.profitability = data.profitability;

    if (this.address.length === 40) this.address = "0x" + this.address;

    this._markets = "markets" in data ? data.markets : null;
  }

  get label() {
    return this.address.slice(0, 6);
  }

  msg() {
    super.__data = {
      address: this.address,
      ctokenidpay: this.ctokenidpay,
      ctokenidseize: this.ctokenidseize,
      profitability: this.profitability,
      markets: this._markets
    };
    return this;
  }

  async init() {
    let markets = [];

    const addrs = await Comptroller.mainnet.marketsEnteredBy(this.address);
    for (let addr of addrs) {
      const token = Tokens.mainnetByAddr[addr.toLowerCase()];
      markets.push({
        address: addr,
        borrow_uUnits: Number(await token.uUnitsBorrowedBy(this.address)),
        supply_uUnits: Number(await token.uUnitsSuppliedBy(this.address)),
        collat: Number(await Comptroller.mainnet.collateralFactorFor(token))
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
      if (costInEth === null) return 0;

      borrow += market.borrow_uUnits * costInEth;
      supply += market.supply_uUnits * costInEth * market.collat;
    }

    return {
      liquidity: supply - borrow,
      health: supply / borrow
    };
  }

  async isLiquidatableWithPriceFrom(oracle) {
    return (await this.liquidityOffChain(oracle)).liquidity < 0.0;
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

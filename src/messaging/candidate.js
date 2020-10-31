const Message = require("./message");

class Candidate extends Message {
  constructor(data) {
    super();

    this.address = data.address;
    this.ctokenidpay = data.ctokenidpay;
    this.ctokenidseize = data.ctokenidseize;
    this.profitability = data.profitability;

    if (this.address.length === 40) this.address = "0x" + this.address;

    this.markets = "markets" in data ? data.markets : null;
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
      markets: this.markets
    };
    return this;
  }

  async refreshBalances(web3, comptroller, tokens) {
    let markets = [];

    const addrs = await comptroller.marketsEnteredBy(this.address)(web3);

    let borrow_uUnitsArr = [];
    let supply_uUnitsArr = [];
    let collatArr = [];

    addrs.forEach((addr, i) => {
      const token = tokens[addr.toLowerCase()];
      borrow_uUnitsArr.push(token.uUnitsBorrowedBy(this.address)(web3));
      supply_uUnitsArr.push(token.uUnitsSuppliedBy(this.address)(web3));
      collatArr.push(comptroller.collateralFactorFor(token)(web3));
    });

    [borrow_uUnitsArr, supply_uUnitsArr, collatArr] = await Promise.all([
      Promise.all(borrow_uUnitsArr),
      Promise.all(supply_uUnitsArr),
      Promise.all(collatArr)
    ]);

    addrs.forEach((addr, i) => {
      markets.push({
        address: addr,
        borrow_uUnits: Number(borrow_uUnitsArr[i]),
        supply_uUnits: Number(supply_uUnitsArr[i]),
        collat: Number(collatArr[i]),
        symbol: null,
        limit: null
      });
    });

    this.markets = markets;
  }

  liquidityOffChain(oracle) {
    if (this.markets === null) return {};

    let borrow = 0;
    let supply = 0;

    for (let market of this.markets) {
      // Populate symbol field if necessary
      if (market.symbol === null)
        market.symbol = oracle.getSymbol(market.address);
      // Figure out whether to use min or max price
      const priceInfo = oracle.getPriceInfo(market.symbol);
      let costInUSD;
      if (market.supply_uUnits > 0) {
        costInUSD = priceInfo.min;
        market.limit = "min";
      } else {
        costInUSD = priceInfo.max;
        market.limit = "max";
      }
      // If price is null just abort mission :)
      if (costInUSD === null) return {};
      // Otherwise update net borrow & supply amounts
      borrow += market.borrow_uUnits * Number(costInUSD);
      supply += market.supply_uUnits * Number(costInUSD) * market.collat;
    }

    // TODO: Note that this is in USD from the Coinbase reporter oracle,
    // but values from Compound's CToken endpoint are still in ETH. Just
    // be careful until this is documented
    return {
      liquidity: supply - borrow,
      health: supply / borrow
    };
  }

  isLiquidatableWithPriceFrom(oracle) {
    return this.liquidityOffChain(oracle).liquidity < 0.0;
  }

  liquidityOnChain(web3, comptroller) {
    // TODO: Note that this will probably be in USD now that the
    // oracle has been updated
    return comptroller.accountLiquidityOf(this.address)(web3);
  }

  async isLiquidatable(web3, comptroller) {
    const liquidity = await this.liquidityOnChain(web3, comptroller);
    return liquidity !== null && liquidity[1].gt(0.0);
  }
}

module.exports = Candidate;

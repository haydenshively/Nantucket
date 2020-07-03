const fetch = require("node-fetch");

const Fetchable = require("../fetchable");

class CToken {
  constructor(json) {
    Object.assign(this, json);
  }

  borrowRate() {
    return this.borrow_rate.value;
  }

  cash() {
    return this.cash.value;
  }

  collateralFactor() {
    return this.collateral_factor.value;
  }

  exchangeRate() {
    return this.exchange_rate.value;
  }

  interestRateModelAddress() {
    return this.interest_rate_model_address;
  }

  name() {
    return this.name;
  }

  numberOfBorrowers() {
    return this.number_of_borrowers;
  }

  numberOfSuppliers() {
    return this.number_of_suppliers;
  }

  reserves() {
    return this.reserves.value;
  }

  supplyRate() {
    return this.supply_rate.value;
  }

  symbol() {
    return this.symbol;
  }

  tokenAddress() {
    return this.token_address;
  }

  totalBorrows() {
    return this.total_borrowers.value;
  }

  totalSupply() {
    return this.total_supply.value;
  }

  underlyingAddress() {
    return this.underlying_address;
  }

  underlyingName() {
    return this.underlying_name;
  }

  underlyingPrice() {
    return this.underlying_price.value;
  }

  underlyingSymbol() {
    return this.underlying_symbol;
  }
}

class CTokens extends Fetchable {
  async fetch(withConfig) {
    const params = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    };

    const urlParams = Object.keys(withConfig)
      .map(key => key + "=" + withConfig[key])
      .join("&");

    const res = await fetch(
      process.env.COMPOUND_ENDPOINT + "/ctoken?" + urlParams,
      params
    );
    const json = await res.json();

    return {
      error: json.error,
      tokens: json.cToken.map(i => new CToken(i))
    };
  }
}

module.exports = CTokens;

const fetch = require("node-fetch");

const Fetchable = require("../fetchable");

class CToken {
  constructor(json) {
    this.json = json;
  }

  address() {
    return this.json.token_address;
  }

  borrowRate() {
    return this.json.borrow_rate.value;
  }

  cash() {
    return this.json.cash.value;
  }

  collateralFactor() {
    return this.json.collateral_factor.value;
  }

  exchangeRate() {
    return this.json.exchange_rate.value;
  }

  interestRateModelAddress() {
    return this.json.interest_rate_model_address;
  }

  name() {
    return this.json.name;
  }

  numberOfBorrowers() {
    return this.json.number_of_borrowers;
  }

  numberOfSuppliers() {
    return this.json.number_of_suppliers;
  }

  reserves() {
    return this.json.reserves.value;
  }

  supplyRate() {
    return this.json.supply_rate.value;
  }

  symbol() {
    return this.json.symbol;
  }

  totalBorrows() {
    return this.json.total_borrows.value;
  }

  totalSupply() {
    return this.json.total_supply.value;
  }

  underlyingAddress() {
    return this.json.underlying_address;
  }

  underlyingName() {
    return this.json.underlying_name;
  }

  underlyingPrice() {
    return this.json.underlying_price.value;
  }

  underlyingSymbol() {
    return this.json.underlying_symbol;
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

    try {
      const res = await fetch(
        process.env.COMPOUND_ENDPOINT + "/ctoken?" + urlParams,
        params
      );
      const json = await res.json();

      return {
        error: json.error,
        tokens: json.cToken.map(i => new CToken(i))
      };
    } catch (error) {
      return { error: error };
    }
  }
}

module.exports = CTokens;

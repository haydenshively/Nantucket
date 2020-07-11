const fetch = require("node-fetch");

const Fetchable = require("../fetchable");

class Account {
  static CToken = class {
    constructor(json) {
      this.json = json;
    }

    address() {
      return this.json.address;
    }

    borrowBalanceUnderlying() {
      return this.json.borrow_balance_underlying.value;
    }

    supplyBalanceUnderlying() {
      return this.json.supply_balance_underlying.value;
    }
  };

  constructor(json) {
    this.json = json;
    this.tokens = json.tokens.map(t => new Account.CToken(t));
  }

  address() {
    return this.json.address;
  }

  health() {
    return this.json.health.value;
  }

  totalBorrowValueInEth() {
    return this.json.total_borrow_value_in_eth.value;
  }

  totalCollateralValueInEth() {
    return this.json.total_collateral_value_in_eth.value;
  }
}

class Accounts extends Fetchable {
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
      process.env.COMPOUND_ENDPOINT + "/account?" + urlParams,
      params
    );
    const json = await res.json();

    return {
      error: json.error,
      pagination: json.pagination_summary,
      accounts: json.accounts.map(i => new Account(i))
    };
  }

  async fetchAll(blockNo, forEachChunk = null) {
    let accounts = [];

    let i = 1;
    let pageCount;

    let result;
    do {
      result = await this.fetch({
        page_number: i,
        page_size: 200,
        block_number: blockNo
      });
      pageCount = result.pagination.total_pages;
      i++;

      if (forEachChunk === null) accounts = accounts.concat(result.accounts);
      else forEachChunk(result.accounts);
    } while (i <= pageCount);

    return accounts;
  }
}

// exports.AccountService = Accounts;
module.exports = Accounts;

// exports.fetchCTokenUnderlyingPrices_Eth = async () => {
//   // Set HTTP request parameters
//   let params = {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Accept: "application/json"
//     }
//   };
//   // Await JSON
//   const res = await fetch(url + "/ctoken", params);
//   const json = await res.json();

//   let cTokenUnderlyingPrices_Eth = {};
//   const cTokens = json["cToken"];
//   cTokens.forEach(cToken => {
//     cTokenUnderlyingPrices_Eth[cToken.symbol] = cToken.underlying_price.value;
//   });

//   return cTokenUnderlyingPrices_Eth;
// };

// exports.fetchAccounts = async maxHealth => {
//   // Set HTTP request parameters
//   let params = {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       Accept: "application/json"
//     }
//   };
//   // Initialize variables involved in the HTTP response
//   let accounts = [];
//   let closeFactor = 0;
//   let liquidationIncentive = 0;
//   let page = 1;
//   let totalPages = 0;
//   // Get at least 1 page of results. Append more pages until all accounts < maxHealth have been fetched
//   do {
//     params["body"] = JSON.stringify({ page_number: page, page_size: 100 });
//     // Await JSON
//     const res = await fetch(url + "/account", params);
//     const json = await res.json();
//     // Save data from JSON to local variables
//     if (json["accounts"] !== undefined)
//       accounts = [...accounts, ...json["accounts"]];
//     if (json["close_factor"] !== undefined) closeFactor = json["close_factor"];
//     if (json["liquidation_incentive"] !== undefined)
//       liquidationIncentive = json["liquidation_incentive"];
//     // Assumes that account results are ordered from least to most healthy
//     if (accounts.some(acct => acct.health && acct.health.value > maxHealth))
//       break;
//     // Figure out how many pages there are, in case we need to go through all of them
//     const pagination = json["pagination_summary"];
//     if (pagination && pagination.total_pages)
//       totalPages = pagination.total_pages;
//     page++;
//   } while (page < totalPages);

//   return accounts.filter(acct => acct.health && acct.health.value <= maxHealth);
// };

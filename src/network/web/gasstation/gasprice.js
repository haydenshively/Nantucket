const fetch = require("node-fetch");

const Fetchable = require("../fetchable");

class GasPrice extends Fetchable {
  async fetch() {
    const res = await fetch(process.env.GAS_STATION_ENDPOINT, {
      method: "GET"
    });
    const json = await res.json();

    return {
      fastest: json.fastest ? Number(json.fastest) * 1e8 : null,
      fast: json.fast ? Number(json.fast) * 1e8 : null,
      average: json.average ? Number(json.average) * 1e8 : null,
      safeLow: json.safeLow ? Number(json.safeLow) * 1e8 : null
    };
  }
}

module.exports = GasPrice;

import nfetch from "node-fetch";
import Fetchable from "../fetchable";

class GasPrice implements Fetchable {
  async fetch() {
    const res = await nfetch(process.env.GAS_STATION_ENDPOINT, {
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

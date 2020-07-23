const nfetch = require("node-fetch");

const Fetchable = require("../fetchable");

class AddressInfo extends Fetchable {
  async fetch(withConfig) {
    const res = await nfetch(
      process.env.ETHPLORER_ENDPOINT +
        "/getAddressInfo/" +
        withConfig +
        "?apiKey=freekey",
      { method: "GET" }
    );
    const json = await res.json();

    let balances = {};
    balances["ETH"] = json.ETH ? json.ETH.balance : 0.0;

    const tokens = json.tokens ? json.tokens : [];
    tokens.forEach(token => {
      if (token) {
        const decimals = token.tokenInfo.decimals.toString();
        balances[token.tokenInfo.symbol] =
          token.balance / Number("1e" + decimals);
      }
    });

    return {
      error: json.error,
      balances: balances
    };
  }
}

module.exports = AddressInfo;

const nfetch = require("node-fetch");

const Oracle = require("../oracle");

class Ticker extends Oracle {
  constructor(tokens) {
    super();

    this._tokens = tokens;
    this._counter = 0;
    this._prices = {};
  }

  async fetch(withConfig) {
    const res = await nfetch(
      process.env.COINBASE_ENDPOINT + `/products/${withConfig}/ticker`,
      { method: "GET" }
    );
    let json = {};
    try {
      json = await res.json();
    } catch {
      console.log("Coinbase fetch failed. Error converting JSON");
    }
    if (json.message === "NotFound") {
      switch (withConfig) {
        case "SAI-USD":
          json.price = "1.00";
          break;
        case "USDC-USD":
          json.price = "1.00";
          break;
        case "USDT-USD":
          json.price = "1.00";
          break;
        default:
          throw `Coinbase Oracle couldn't find symbol ${withConfig}`;
      }
    }
    return json;
  }

  update() {
    const token = this._tokens[this._counter];

    this.fetch(token.symbol).then(json => {
      this._prices[token.address] = json.price;
      this._counter = (this._counter + 1) % this._tokens.length;

      if (this._counter !== 0) setTimeout(this.update.bind(this), 350);
    });
  }

  getPrice(tokenAddress) {
    tokenAddress = tokenAddress.toLowerCase();
    if (
      this._prices[tokenAddress] === undefined ||
      this._prices["0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5"] === undefined
    )
      return null;
    return (
      this._prices[tokenAddress] /
      this._prices["0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5"]
    );
  }
}

exports.Ticker = Ticker;
exports.mainnet = new Ticker([
  { address: "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5", symbol: "ETH-USD" },
  { address: "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e", symbol: "BAT-USDC" },
  { address: "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643", symbol: "DAI-USD" },
  { address: "0x158079ee67fce2f58472a96584a73c7ab9ac95c1", symbol: "REP-USD" },
  { address: "0xf5dce57282a584d2746faf1593d3121fcac444dc", symbol: "SAI-USD" },
  { address: "0x39aa39c021dfbae8fac545936693ac917d5e7563", symbol: "USDC-USD" },
  { address: "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9", symbol: "USDT-USD" },
  { address: "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4", symbol: "BTC-USD" },
  { address: "0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407", symbol: "ZRX-USD" }
]);

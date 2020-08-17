const crypto = require("crypto");
const nfetch = require("node-fetch");

const Oracle = require("../../../messaging/oracle");

class Reporter extends Oracle {
  constructor(data) {
    super(data);

    this._USDC = "1.00"; // in USD
    this._USDT = "1.00"; // in USD
    this._SAI_PER_ETH = 0.005285;
  }

  _mySignature(path = "/oracle", method = "GET", body = "") {
    const timestamp = Date.now() / 1000;
    const prehash = timestamp + method.toUpperCase() + path + body;
    const hash = crypto
      .createHmac("sha256", Buffer(process.env.CB_ACCESS_SECRET, "base64"))
      .update(prehash)
      .digest("base64");

    return {
      hash: hash,
      timestamp: timestamp
    };
  }

  _setStablecoins() {
    if (this._prices === null) return;
    this._prices["USDC"] = this._USDC;
    this._prices["USDT"] = this._USDT;
    this._prices["SAI"] = (
      this._SAI_PER_ETH * Number(this._prices.ETH)
    ).toFixed(6);
  }

  async fetch() {
    const mySignature = this._mySignature();
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "CB-ACCESS-KEY": process.env.CB_ACCESS_KEY,
      "CB-ACCESS-SIGN": mySignature.hash,
      "CB-ACCESS-TIMESTAMP": mySignature.timestamp,
      "CB-ACCESS-PASSPHRASE": process.env.CB_ACCESS_PASSPHRASE
    };

    const res = await nfetch(process.env.COINBASE_ENDPOINT + "/oracle", {
      method: "GET",
      headers: headers
    });

    try {
      const json = await res.json();
      this._messages = json.messages;
      this._signatures = json.signatures;
      this._prices = json.prices;

      this._setStablecoins();
    } catch {
      console.log("Coinbase fetch failed. Error converting to JSON");
    }
  }
}

exports.Reporter = Reporter;
exports.mainnet = new Reporter({
  symbols: {
    "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5": "ETH",
    "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e": "BAT",
    "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643": "DAI",
    "0x158079ee67fce2f58472a96584a73c7ab9ac95c1": "REP",
    "0xf5dce57282a584d2746faf1593d3121fcac444dc": "SAI",
    "0x39aa39c021dfbae8fac545936693ac917d5e7563": "USDC",
    "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9": "USDT",
    "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4": "BTC",
    "0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407": "ZRX"
  }
});

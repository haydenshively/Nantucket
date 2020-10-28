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
    this._prices.USDC.min = this._USDC;
    this._prices.USDC.max = this._USDC;
    this._prices.USDT.min = this._USDT;
    this._prices.USDT.max = this._USDT;

    if (this._prices.ETH.min !== null)
      this._prices.SAI.min = (
        this._SAI_PER_ETH * Number(this._prices.ETH.min)
      ).toFixed(6);
    if (this._prices.ETH.max !== null)
      this._prices.SAI.max = (
        this._SAI_PER_ETH * Number(this._prices.ETH.max)
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

    let didUpdate = false;

    try {
      const res = await nfetch(process.env.COINBASE_ENDPOINT + "/oracle", {
        method: "GET",
        headers: headers
      });
      const json = await res.json();

      for (let i = 0; i < json.messages.length; i++) {
        const message = json.messages[i];
        // Decode message, just as the oracle would on-chain
        const { timestamp, symbol, price } = this._decode(message);
        if (!(symbol in this._messages)) continue;
        // Save resulting components into their respective fields
        this._messages[symbol][timestamp] = message;
        this._signatures[symbol][timestamp] = json.signatures[i];
        this._prices[symbol].history.push({
          timestamp: timestamp,
          price: price
        });
        // Update min/max price information if necessary. Note that JS Numbers are technically
        // only good up to 2^53. Big.js would be ideal, but Number should be good enough
        const priceInfo = this._prices[symbol];
        const priceN = Number(price);
        // Check min
        let better = priceInfo.min === null || Number(priceInfo.min) >= priceN;
        let allowed =
          priceInfo.minConstraint === null ||
          Number(priceInfo.minConstraint) < priceN;
        if (better && allowed) {
          this._prices[symbol].min = price;
          this._prices[symbol].minTimestamp = timestamp;
          didUpdate = true;
        }
        // Check max
        better = priceInfo.max === null || Number(priceInfo.max) <= priceN;
        allowed =
          priceInfo.maxConstraint === null ||
          Number(priceInfo.maxConstraint) > priceN;
        if (better && allowed) {
          this._prices[symbol].max = price;
          this._prices[symbol].maxTimestamp = timestamp;
          didUpdate = true;
        }
      }

      this._setStablecoins();
    } catch (e) {
      if (e instanceof nfetch.FetchError)
        console.log("Coinbase fetch failed. Connection probably timed out");
      else console.log("Coinbase fetch failed. Error converting to JSON");
      console.log(e);
    }

    return didUpdate;
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
    "0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407": "ZRX",
    "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": "UNI",
    "0x70e36f6bf80a52b3b46b3af8e106cc0ed743e8e4": "COMP"
  }
});

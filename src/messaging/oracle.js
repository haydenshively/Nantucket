const ABIUtils = require("web3-eth-abi");

const Message = require("./message");

class Oracle extends Message {
  constructor(data) {
    super();

    this._symbols = data.symbols;

    if ("prices" in data) {
      this._messages = data.messages;
      this._signatures = data.signatures;
      this._prices = data.prices;
    } else {
      this._messages = {};
      this._signatures = {};
      this._prices = {};

      for (let symbol of Object.values(this._symbols)) {
        this._messages[symbol] = {};
        this._signatures[symbol] = {};
        this._prices[symbol] = {
          minConstraint: null,
          maxConstraint: null,
          min: null,
          max: null,
          minTimestamp: null,
          maxTimestamp: null,
          history: []
        };
      }
    }
  }

  msg() {
    const pricesNoHistory = {};
    for (let symbol in this._prices) {
      pricesNoHistory[symbol] = { ...this._prices[symbol] };
      pricesNoHistory[symbol].history = [];
    }

    super.__data = {
      symbols: this._symbols,
      messages: this._messages,
      signatures: this._signatures,
      prices: pricesNoHistory
    };
    return this;
  }

  respondToNewAnchor(event) {
    const symbol = event.symbol;
    const anchor = event.anchorPrice;
    if (!(symbol in this._prices)) return;
    // Update constraints based on anchor price
    this._prices[symbol].minConstraint = (Number(anchor) * 0.8).toFixed(0);
    this._prices[symbol].maxConstraint = (Number(anchor) * 1.2).toFixed(0);
    // Delete stale entries from history, messages, and signatures
    this.removeInfoUpToAndIncluding(symbol, event.newTimestamp);
    // Update min and max
    this.resetMinAndMax(symbol);
  }

  respondToPost(event) {
    if (!(event.symbol in this._prices)) return;
    this.becomeMinOrMax(event.symbol, event.price, null);
  }

  removeInfoUpToAndIncluding(symbol, timestamp) {
    let i;
    for (i = 0; i < this._prices[symbol].history.length; i++) {
      const ts = this._prices[symbol].history[i].timestamp;
      if (Number(ts) > Number(timestamp)) break;

      delete this._messages[symbol][ts];
      delete this._signatures[symbol][ts];
    }
    this._prices[symbol].history.splice(0, i);
  }

  resetMinAndMax(symbol) {
    this._prices[symbol].min = null;
    this._prices[symbol].minTimestamp = null;
    this._prices[symbol].max = null;
    this._prices[symbol].maxTimestamp = null;
    this._prices[symbol].history.forEach(item =>
      this.becomeMinOrMax(symbol, item.price, item.timestamp)
    );
  }

  becomeMinOrMax(symbol, price, timestamp) {
    const info = this._prices[symbol];
    const priceN = Number(price);

    let success = false;
    let better;
    let allow;

    // Check min
    better = info.min === null || Number(info.min) >= priceN;
    allow = info.minConstraint === null || Number(info.minConstraint) < priceN;
    if (better && allow) {
      info.min = price;
      info.minTimestamp = timestamp;
      success = true;
    }
    // Check max
    better = info.max === null || Number(info.max) <= priceN;
    allow = info.maxConstraint === null || Number(info.maxConstraint) > priceN;
    if (better && allow) {
      info.max = price;
      info.maxTimestamp = timestamp;
      success = true;
    }

    return success;
  }

  _decode(oracleEncodedMessage) {
    const {
      0: kind,
      1: timestamp,
      2: symbol,
      3: price
    } = ABIUtils.decodeParameters(
      ["string", "uint64", "string", "uint64"],
      oracleEncodedMessage
    );

    return {
      timestamp: timestamp,
      symbol: symbol,
      price: price
    };
  }

  postableDataFor(markets) {
    let messages = [];
    let signatures = [];
    let symbols = [];

    // TODO this caution shouldn't be necessary, but sometimes markets is null
    if (markets === null) {
      console.log("postableDataFor got null markets for some reason :(");
      return null;
    }
    if (typeof markets[Symbol.iterator] !== "function") {
      console.log("postableDataFor got non-array markets for some reason :(");
      return null;
    }

    let foundEth = false;

    for (let market of markets) {
      let symbol = market.symbol;

      // SAI price can only be updated vicariously through ETH:
      if (symbol === "SAI") symbol = "ETH";
      if (symbol === "ETH") {
        if (foundEth) continue;
        foundEth = true;
      }

      // TODO this check shouldn't be necessary
      if (symbol === null) {
        console.log("postableDataFor got market with null symbol");
        continue;
      }
      // TODO this check shouldn't be necessary
      if (market.limit === null) {
        console.log(`postableDataFor got market ${symbol} with null limit`);
        continue;
      }
      let timestamp = this._prices[symbol][market.limit + "Timestamp"];
      // If timestamp is null, this must be a stablecoin for
      // which we don't need to post any data OR the currently
      // posted price is the best one to use
      if (timestamp === null) continue;

      const message = this._messages[symbol][timestamp];
      const signature = this._signatures[symbol][timestamp];

      // TODO this check shouldn't be necessary
      if (message === undefined || signature === undefined) {
        console.error(`msg or sig undefined in getPostableData for ${symbol}`);
        continue;
      }

      messages.push(message);
      signatures.push(signature);
      symbols.push(symbol);
    }
    return [messages, signatures, symbols];
  }

  getSymbol(tokenAddress) {
    return this._symbols[tokenAddress.toLowerCase()];
  }

  getPriceInfo(tokenSymbol) {
    return this._prices[tokenSymbol];
  }

  getPriceMin(tokenSymbol) {
    return this._prices[tokenSymbol].min;
  }

  getPriceMax(tokenSymbol) {
    return this._prices[tokenSymbol].max;
  }

  getLatestPrice(tokenSymbol) {
    const history = this._prices[tokenSymbol].history;
    if (history.length === 0) return null;
    return history[history.length - 1];
  }
}

module.exports = Oracle;

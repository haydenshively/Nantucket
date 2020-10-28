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
    const pricesNoHistory = { ...this._prices };
    for (let symbol in pricesNoHistory) pricesNoHistory[symbol].history = [];

    super.__data = {
      symbols: this._symbols,
      messages: this._messages,
      signatures: this._signatures,
      prices: pricesNoHistory
    };
    return this;
  }

  removeStaleTimestamps(postingEvent) {
    const symbol = postingEvent.symbol;
    const anchor = postingEvent.anchorPrice;
    // Update constraints based on anchor price
    const minConstraint = Number(anchor) * 0.8;
    const maxConstraint = Number(anchor) * 1.2;
    this._prices[symbol].minConstraint = minConstraint.toFixed(0);
    this._prices[symbol].maxConstraint = maxConstraint.toFixed(0);
    // Delete stale entries from history, messages, and signatures
    let i;
    for (i = 0; i < this._prices[symbol].history.length; i++) {
      const ts = this._prices[symbol].history[i].timestamp;
      if (Number(ts) > Number(postingEvent.newTimestamp)) break;

      delete this._messages[symbol][ts];
      delete this._signatures[symbol][ts];
    }
    this._prices[symbol].splice(0, i);
    // Update min and max
    this._prices[symbol].min = anchor;
    this._prices[symbol].minTimestamp = null;
    this._prices[symbol].max = anchor;
    this._prices[symbol].maxTimestamp = null;
    for (let item of this._prices[symbol].history) {
      // Check min
      let better = Number(this._prices[symbol].min) >= Number(item.price);
      let allowed = minConstraint < Number(item.price);
      if (better && allowed) {
        this._prices[symbol].min = item.price;
        this._prices[symbol].minTimestamp = item.timestamp;
      }
      // Check max
      better = Number(this._prices[symbol].max) <= Number(item.price);
      allowed = maxConstraint > Number(item.price);
      if (better && allowed) {
        this._prices[symbol].max = item.price;
        this._prices[symbol].maxTimestamp = item.timestamp;
      }
    }
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

  // postableData(
  //   include = ["BTC", "ETH", "DAI", "REP", "ZRX", "BAT", "UNI", "COMP"]
  // ) {
  //   let messages = [];
  //   let signatures = [];
  //   let symbols = [];
  //   for (let i = 0; i < this._messages.length; i++) {
  //     const symbol = this._decode(this._messages[i]).key;
  //     if (!include.includes(symbol)) continue;
  //     messages.push(this._messages[i]);
  //     signatures.push(this._signatures[i]);
  //     symbols.push(symbol);
  //   }
  //   return [messages, signatures, symbols];
  // }

  postableDataFor(markets) {
    let messages = [];
    let signatures = [];
    let symbols = [];

    for (let market of markets) {
      const symbol = market.symbol;
      const timestamp = market.timestamp;
      // symbol should never be null, but check just in case.
      // if timestamp is null, this must be a stablecoin for
      // which we don't need to post any data OR the currently
      // posted price is the best one to use
      if (symbol === null || timestamp === null) continue;

      const message = this._messages[symbol][timestamp];
      const signature = this._signatures[symbol][timestamp];

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

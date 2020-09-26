const ABIUtils = require("web3-eth-abi");

const Message = require("./message");

class Oracle extends Message {
  constructor(data) {
    super();

    this._symbols = data.symbols;
    this._messages = "messages" in data ? data.messages : null;
    this._signatures = "signatures" in data ? data.signatures : null;
    this._prices = "prices" in data ? data.prices : null;
    this._timestamp = "timestamp" in data ? data.timestamp : null;
  }

  msg() {
    super.__data = {
      symbols: this._symbols,
      messages: this._messages,
      signatures: this._signatures,
      prices: this._prices,
      timestamp: this._timestamp
    };
    return this;
  }

  _decode(oracleEncodedMessage) {
    const {
      0: kind,
      1: timestamp,
      2: key,
      3: value
    } = ABIUtils.decodeParameters(
      ["string", "uint64", "string", "uint64"],
      oracleEncodedMessage
    );

    return {
      timestamp: timestamp,
      key: key,
      price: value
    };
  }

  postableData(include = ["BTC", "ETH", "DAI", "REP", "ZRX", "BAT"]) {
    let messages = [];
    let signatures = [];
    let symbols = [];
    for (let i = 0; i < this._messages.length; i++) {
      const symbol = this._decode(this._messages[i]).key;
      if (!include.includes(symbol)) continue;
      messages.push(this._messages[i]);
      signatures.push(this._signatures[i]);
      symbols.push(symbol);
    }
    return [messages, signatures, symbols];
  }

  getPrice(tokenAddress) {
    if (this._prices === null) return null;

    const symbol = this._symbols[tokenAddress];
    return this._prices[symbol];
  }

  getPriceSymbol(tokenSymbol) {
    if (this._prices === null) return null;

    return this._prices[tokenSymbol];
  }
}

module.exports = Oracle;

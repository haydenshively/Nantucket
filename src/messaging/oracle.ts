import { AbiCoder } from "web3-eth-abi";
import Message from "./message";

export default class Oracle extends Message {

  private symbols: any;

  protected messages: any;
  protected signatures: any;
  protected prices: any;

  constructor(data: any) {
    super();

    this.symbols = data.symbols;
    this.messages = "messages" in data ? data.messages : null;
    this.signatures = "signatures" in data ? data.signatures : null;
    this.prices = "prices" in data ? data.prices : null;
  }

  msg() {
    this.data = {
      symbols: this.symbols,
      messages: this.messages,
      signatures: this.signatures,
      prices: this.prices
    };
    return this;
  }

  _decode(oracleEncodedMessage) {
    const {
      0: kind,
      1: timestamp,
      2: key,
      3: value
    } = new AbiCoder().decodeParameters(
      ["string", "uint64", "string", "uint64"],
      oracleEncodedMessage
    );

    return {
      timestamp: timestamp,
      key: key,
      price: value
    };
  }

  postableData(exclude = ["XTZ", "LINK", "KNC", "COMP"]) {
    let messages = [];
    let signatures = [];
    let symbols = [];
    for (let i = 0; i < this.messages.length; i++) {
      const symbol = this._decode(this.messages[i]).key;
      if (exclude.includes(symbol)) continue;
      messages.push(this.messages[i]);
      signatures.push(this.signatures[i]);
      symbols.push(symbol);
    }
    return [messages, signatures, symbols];
  }

  getPrice(tokenAddress) {
    if (!this.prices) return null;

    const symbol = this.symbols[tokenAddress];
    return this.prices[symbol];
  }

  getPriceSymbol(tokenSymbol) {
    if (!this.prices) return null;

    return this.prices[tokenSymbol]
  }
}

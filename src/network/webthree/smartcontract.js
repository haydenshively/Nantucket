const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Web3Utils = require("web3-utils");
const ABIUtils = require("web3-utils-abi");

class SmartContract {
  constructor(address, abi, provider) {
    this.address = address;
    this._inner = new provider.eth.Contract(abi, this.address);
  }

  _txFor(encodedMethod, gasLimit, gasPrice) {
    return {
      to: this.address,
      gasLimit: gasLimit,
      gasPrice: gasPrice,
      data: encodedMethod
    };
  }

  subscribeToLogEvent(eventName, callback) {
    const eventJsonInterface = Web3Utils._.find(
      this._inner._jsonInterface,
      o => o.name === eventName && o.type === "event"
    );
    return web3.eth.subscribe(
      "logs",
      {
        address: this.address,
        topics: [eventJsonInterface.signature]
      },
      (error, result) => {
        if (error) {
          callback(error, null);
          return;
        }
        const eventObj = ABIUtils.decodeLog(
          eventJsonInterface.inputs,
          result.data,
          result.topics.slice(1)
        );
        callback(error, eventObj);
      }
    );
  }

  onNewPendingEvent(eventName) {
    /*
    .on("connected", (subscriptionID) => {})
    .on("changed", (event) => {}) // event.removed = true
    .on("error", (error, receipt) => {}) // receipt only present if failed on-chain
    .on("data", (event) => {}) // event.removed = undefined
    */
    return this._inner.events[eventName]({
      fromBlock: "pending"
    });
  }
}

module.exports = SmartContract;

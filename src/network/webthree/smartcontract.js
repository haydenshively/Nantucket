const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const ABIUtils = require("web3-eth-abi");
const Web3Contract = require("web3-eth-contract");
const Web3Utils = require("web3-utils");

class SmartContract {
  constructor(address, abi) {
    this.address = address;
    this._inner = new Web3Contract(abi, address);
  }

  _callerForUint256(method, modifier = x => x) {
    return this._callerFor(method, ["uint256"], x => modifier(Big(x["0"])));
  }

  _callerFor(method, outputTypes, modifier = x => x) {
    return async (provider, block = "latest") => {
      const x = await provider.eth.call(this._txFor(method), block);
      return modifier(ABIUtils.decodeParameters(outputTypes, x));
    };
  }

  _txFor(method, gasLimit = undefined, gasPrice = undefined) {
    return {
      to: this.address,
      data: method.encodeABI(),
      gasLimit: gasLimit,
      gasPrice: gasPrice
    };
  }

  subscribeToLogEvent(provider, eventName, callback) {
    const eventJsonInterface = Web3Utils._.find(
      this._inner._jsonInterface,
      o => o.name === eventName && o.type === "event"
    );
    return provider.eth.subscribe(
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

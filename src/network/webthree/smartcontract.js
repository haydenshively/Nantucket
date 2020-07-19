const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

class SmartContract {
  constructor(address, abi) {
    this.address = address;
    this.abi = abi;
    this.contract = new web3.eth.Contract(this.abi, this.address);
  }

  txFor(encodedMethod, gasLimit, gasPrice) {
    return {
      to: this.address,
      gas: web3.utils.toHex(gasLimit),
      gasPrice: Big(gasPrice).times(1e9).toFixed(0),
      data: encodedMethod
    };
  }

  txWithValueFor(encodedMethod, gasLimit, gasPrice, value) {
    return {
      ...this.txFor(encodedMethod, gasLimit, gasPrice),
      value: value
    };
  }

  subscribeToLogEvent(eventName, callback) {
    const eventJsonInterface = web3.utils._.find(
      this.contract._jsonInterface,
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
        const eventObj = web3.eth.abi.decodeLog(
          eventJsonInterface.inputs,
          result.data,
          result.topics.slice(1)
        );
        callback(error, eventObj);
      }
    );
  }
}

module.exports = SmartContract;

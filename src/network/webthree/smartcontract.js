const EthAccount = require("./ethaccount");

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
      gasPrice: web3.utils.toHex(gasPrice),
      data: encodedMethod
    };
  }

  txWithValueFor(encodedMethod, gasLimit, gasPrice, value) {
    return {
      to: this.address,
      gas: web3.utils.toHex(gasLimit),
      gasPrice: web3.utils.toHex(gasPrice),
      data: encodedMethod,
      value: value
    };
  }

  replacementTxFor(encodedMethod, newGasPrice) {
    let nonceToReplace = null;
    let tx = null;

    for (let nonce in EthAccount.shared.pendingTransactions) {
      const pendingTransaction = EthAccount.shared.pendingTransactions[nonce];
      if (pendingTransaction.data === encodedMethod) {
        nonceToReplace = nonce;
        tx = pendingTransaction;
        break;
      }
    }

    if (nonceToReplace === null) {
      console.error(
        "Failed to override update gas price. Transaction doesn't exist."
      );
      return;
    }

    tx.gasPrice = newGasPrice;
    return tx;
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

import { Contract as Web3Contract } from "web3-eth-contract";
import { AbiCoder } from "web3-eth-abi";
import Web3Utils from "web3-utils";

import Big from "../../big";

export default abstract class SmartContract {

  public address: string;
  protected inner: Web3Contract;
  private abiCoder: AbiCoder;

  constructor(address, abi) {
    this.address = address;
    this.inner = new Web3Contract(abi, address);
    this.abiCoder = new AbiCoder()
  }

  _callerForUint256(method, modifier = x => x) {
    return this._callerFor(method, ["uint256"], x => modifier(Big(x["0"])));
  }

  _callerFor(method, outputTypes, modifier = x => x) {
    return async (provider, block = "latest") => {
      const x = await provider.eth.call(this._txFor(method), block);
      return modifier(this.abiCoder.decodeParameters(outputTypes, x));
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
    // TODO: Verify that this usage of web3 utils is correct
    // @ts-ignore
    const eventJsonInterface = Web3Utils._.find(
      // @ts-ignore
      this.inner._jsonInterface,
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
        const eventObj = this.abiCoder.decodeLog(
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
    return this.inner.events[eventName]({
      fromBlock: "pending"
    });
  }
}

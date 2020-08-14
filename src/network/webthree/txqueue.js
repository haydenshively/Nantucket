const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const winston = require("winston");

const Wallet = require("./wallet");

// Like TxManager, but no priorities, and everything is always in progress
class TxQueue {
  constructor(envKeyAddress, envKeySecret) {
    this._wallet = new Wallet(envKeyAddress, envKeySecret);

    this._lowestLiquidNonce = null;
    this._queue = [];
  }

  get length() {
    return this._queue.length;
  }

  async rebase() {
    this._lowestLiquidNonce = await this._wallet.getLowestLiquidNonce();
  }

  append(tx) {
    const idx = this._queue.push(tx) - 1;
    return this._broadcast(idx);
  }

  replace(idx, tx, gasPriceMode) {
    switch (gasPriceMode) {
      case "as_is":
        break;
      case "clip":
        const minGasPrice = this._wallet.minGasPriceFor(this.nonce(idx));
        if (tx.gasPrice.gt(minGasPrice)) break;
      case "min":
        tx.gasPrice = minGasPrice;
    }

    this._queue[idx] = tx;
    return this._broadcast(idx);
  }

  dump(idx) {
    this._queue[idx] = this._wallet.emptyTx;
    this._queue[idx].gasPrice = this._wallet.minGasPriceFor(this.nonce(idx));
    return this._broadcast(idx);
  }

  nonce(idx) {
    return this._lowestLiquidNonce + idx;
  }

  idx(nonce) {
    return nonce - this._lowestLiquidNonce;
  }

  _broadcast(idx) {
    const tx = this._queue[idx];
    const nonce = this.nonce(idx);
    const sentTx = this._wallet.signAndSend(tx, nonce);

    this._setupTxEvents(sentTx, nonce);
  }

  _setupTxEvents(sentTx, nonce, gasPrice) {
    const label = `💸 *Transaction* | ${this._wallet.label}:${nonce} `;

    // After receiving the transaction hash, log its Etherscan link
    sentTx.on("transactionHash", hash => {
      winston.info(`${label}On <https://etherscan.io/tx/${hash}|etherscan>`);
    });
    // After receiving receipt, log success and perform cleanup
    sentTx.on("receipt", receipt => {
      winston.info(`${label}Successful at block ${receipt.blockNumber}!`);
      this._onTxReceiptFor(nonce);
    });
    // After receiving an error, check if it occurred on or off chain
    sentTx.on("error", (err, receipt) => {
      // If it occurred on-chain, receipt will be defined.
      // Treat it the same as the successful receipt case.
      if (receipt !== undefined) {
        winston.info(label + "Failed on-chain :(");
        this._onTxReceiptFor(nonce);
        return;
      }
      // If it occurred off-chain, move on to the next transaction. If the
      // error was that the nonce was too low, raise the nonce (overrides
      // the default behavior of this._onTxErrorFor)
      this._onTxErrorFor(nonce, gasPrice, () => {
        winston.log("error", label + String(err));
        if (String(err).includes("nonce too low")) this._nextNonce++;
      });
    });
  }

  _onTxReceiptFor(nonce) {
    if (this.idx(nonce) !== 0)
      winston.warn("Transaction receipts received out of order");
    // this._queue.splice(this.idx(nonce), 1)
    this._queue.shift();
    this.rebase();
  }

  _onTxErrorFor(nonce, gasPrice, f = null) {
    // If the sent tx times-out, fails, or errors when it no longer
    // has a matching tx in the queue, we can infer that it was replaced
    // and/or succeeded under a separate hash. As such, we can
    // ignore whatever dropped tx is calling this function.
    // Ideally we would remove callbacks when dropping
    // transactions, but that's easier said than done.
    // TODO Switch to ethersjs instead of Web3js and remove
    // callbacks when dropping transactions
    const matches = this._queue.filter(
      q =>
        q.id === nonce &&
        ((gasPrice === undefined && !(gasPrice in q.tx)) ||
          q.tx.gasPrice.eq(gasPrice))
    );
    if (matches.length === 0) return;

    const queueOld = [...this._queue];
    this._queue = [];

    for (let item of queueOld) {
      if (item.id !== nonce) {
        item.id = null;
        item.inProgress = false;
        this._queue.push(item);
      }
    }

    this._nextNonce = nonce;
    this._numInProgressTxs = 0;
    if (f !== null) f.bind(this)();
    this._maximizeNumInProgressTxs();
  }
}

module.exports = TxQueue;

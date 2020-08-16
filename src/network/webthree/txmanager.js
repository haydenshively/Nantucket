const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const winston = require("winston");

const Candidate = require("../../messaging/candidate")
const TxQueue = require("./txqueue");

// src.network.webthree
const FlashLiquidator = require("./network/webthree/goldenage/flashliquidator");
const Tokens = require("./network/webthree/compound/ctoken");

class TxManager {
  /*
   * @param {number} gasPriceMultiplier When sending transactions, use
   *    market-recommended gas price multiplied by this amount
   */
  constructor(envKeyAddress, envKeySecret) {
    this._queue = new TxQueue(envKeyAddress, envKeySecret);
    this._initialized = false;
  }

  async init() {
    await this._queue.rebase();
    this._initialized = true;
  }

  replaceAllPendingWithEmpty() {
    for (let i = 0; i < this._queue.length; i++) {
      if (this._queue[i].inProgress) {
        this._queue[i].tx = this._wallet.emptyTx;
        this._doItem(i);
      }
    }
  }

  async getGasPrice_Gwei() {
    const market_Gwei = Number(await web3.eth.getGasPrice()) / 1e9;
    return market_Gwei * this._gasPriceMultiplier;
  }

  async getTxFee_Eth(gas = 2000000, gasPrice = null) {
    if (gasPrice === null) gasPrice = await this.getGasPrice_Gwei();
    return (gasPrice * gas) / 1e9;
  }

  // const gasPrice_Gwei = await this.getGasPrice_Gwei();
  // const estTxFee_Eth = await this.getTxFee_Eth(undefined, gasPrice_Gwei);
  // const ethPrice_USD =
  //     1.0 / (await Tokens.mainnet.cUSDC.priceInEth()).toFixed(8);
  // const profit = ethPrice_USD * (c.profitability - estTxFee_Eth);
  // if (profit < 0) continue;

  // winston.log(
  //   "info",
  //   `🐳 *Proposal ${i.label}* | Liquidating for $${profit.toFixed(
  //     2
  //   )} profit at block ${blockNumber}`
  // );

  // winston.log(
  //   "info",
  //   `🌊 *Price Wave* | ${i.label} now listed for $${profit.toFixed(
  //     2
  //   )} profit if prices get posted`
  // );

  /**
   * If an item in the queue has the given key, update it's gas price.
   * If that item is already in progress (it's a pending tx), and the
   * new gas price is at least 12% higher than the old one, rebroadcast
   * the tx.
   *
   * @param {String} key identifier to match items against
   * @param {Big} newPrice the new gas price in wei (gwei * 10^9)
   *
   * @returns {Boolean} whether any item in the queue matched the given key
   */
  increaseGasPriceFor(key, newPrice) {
    newPrice = Big(newPrice);
    let didFindTx = false;

    for (let i = 0; i < this._queue.length; i++) {
      if (this._queue[i].key === key) {
        didFindTx = true;
        if (newPrice.times(1.12).lte(this._queue[i].tx.gasPrice)) continue;

        this._queue[i].tx.gasPrice = newPrice;
        if (this._queue[i].inProgress) this._doItem(i);
      }
    }

    return didFindTx;
  }

  /**
   * Adds a new transaction to the wallet's queue (even if it's a duplicate)
   *
   * @param {Object} tx The transaction object {to, gasLimit, gasPrice, data, value}
   * @param {Number} priority Sorting criteria. Higher priority txs go first
   * @param {Number} timeout Time (in milliseconds) after which tx slot will be freed;
   *    if queue contains other txs, they will override this one
   * @param {Boolean} rejectIfDuplicate Ignores the input tx if its "to" and "key" fields
   *    are the same as a transaction in the current queue
   * @param {String} key If two txs have the same key, they will be considered duplicates
   *
   */
  insert(
    tx,
    priority = 0,
    timeout = 60 * 1000,
    rejectIfDuplicate = false,
    key = null
  ) {
    if (rejectIfDuplicate) {
      if (
        this._queue.filter(item => item.tx.to === tx.to && item.key === key)
          .length > 0
      ) {
        winston.log("warn", "💸 *Transaction* | Skipped duplicate");
        return;
      }
    }

    // add tx to queue
    this._queue.push({
      id: null,
      tx: tx,
      priority: priority,
      inProgress: false,
      timeout: timeout,
      key: key
    });
    // if the priority is nonzero, sort queue
    if (priority) this._queue.sort((a, b) => b.priority - a.priority);

    this._maximizeNumInProgressTxs();
  }

  _maximizeNumInProgressTxs() {
    for (let i = 0; i < this._queue.length; i++) {
      if (this._numInProgressTxs === this._maxInProgressTxs) break;

      if (!this._queue[i].inProgress) {
        this._queue[i].inProgress = true;
        this._numInProgressTxs++;

        this._queue[i].id = this._nextNonce;
        this._nextNonce++;

        this._doItem(i);
      }
    }
  }

  /**
   * Send tx and setup its callback events
   *
   * @param {Number} i item index in this._queue
   */
  _doItem(i) {
    const sentTx = this._wallet.signAndSend(
      this._queue[i].tx,
      this._queue[i].id,
      !(gasPrice in this._queue[i].tx)
    );
    if (sentTx === null) {
      this._onTxErrorFor(this._queue[i].id, this._queue[i].tx.gasPrice);
      return;
    }
    const handle = setTimeout(
      this._onTxErrorFor.bind(this),
      this._queue[i].timeout,
      this._queue[i].id,
      this._queue[i].tx.gasPrice
    );
    this._setupTxEvents(
      sentTx,
      this._queue[i].id,
      this._queue[i].tx.gasPrice,
      handle
    );
  }

  _setupTxEvents(sentTx, nonce, gasPrice, timeoutHandle) {
    const label = `💸 *Transaction* | ${this._wallet.label}:${nonce} `;

    // After receiving the transaction hash, log its Etherscan link
    sentTx.on("transactionHash", hash => {
      winston.info(`${label}On <https://etherscan.io/tx/${hash}|etherscan>`);
    });
    // After receiving receipt, log success and perform cleanup
    sentTx.on("receipt", receipt => {
      winston.info(`${label}Successful at block ${receipt.blockNumber}!`);
      this._onTxReceiptFor(nonce, timeoutHandle);
    });
    // After receiving an error, check if it occurred on or off chain
    sentTx.on("error", (err, receipt) => {
      // If it occurred on-chain, receipt will be defined.
      // Treat it the same as the successful receipt case.
      if (receipt !== undefined) {
        winston.info(label + "Failed on-chain :(");
        this._onTxReceiptFor(nonce, timeoutHandle);
        return;
      }
      // If it occurred off-chain, move on to the next transaction. If the
      // error was that the nonce was too low, raise the nonce (overrides
      // the default behavior of this._onTxErrorFor)
      this._onTxErrorFor(nonce, gasPrice, timeoutHandle, () => {
        winston.log("error", label + String(err));
        if (String(err).includes("nonce too low")) this._nextNonce++;
      });
    });
  }

  _onTxReceiptFor(nonce, timeoutHandle) {
    clearTimeout(timeoutHandle);
    this._queue = this._queue.filter(tx => tx.id !== nonce);
    this._numInProgressTxs--;
    this._maximizeNumInProgressTxs();
  }

  _onTxErrorFor(nonce, gasPrice, timeoutHandle = null, f = null) {
    if (timeoutHandle !== null) clearTimeout(timeoutHandle);
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

module.exports = TxManager;

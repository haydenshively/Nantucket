const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const winston = require("winston");

// src.messaging
const Candidate = require("./messaging/candidate");
const Channel = require("./messaging/channel");
const Oracle = require("./messaging/oracle");
// src.network.webthree
const TxQueue = require("./txqueue");

const FlashLiquidator = require("./network/webthree/goldenage/flashliquidator");
const Tokens = require("./network/webthree/compound/ctoken");

class TxManager {
  /*
   * @param {number} gasPriceMultiplier When sending transactions, use
   *    market-recommended gas price multiplied by this amount
   */
  constructor(envKeyAddress, envKeySecret) {
    this._queue = new TxQueue(envKeyAddress, envKeySecret);
    this._oracle = null;

    Channel(Oracle).on("Set", oracle => (this._oracle = oracle));
  }

  async init() {
    await this._queue.rebase();

    Channel(Candidate).on("LiquidateWithPriceUpdate", c => {});
    Channel(Candidate).on("Liquidate", c => {});
  }

  async getGasPrice() {
    return Big(await web3.eth.getGasPrice());
  }

  async getTxFee_Eth(gas = 2000000, gasPrice = null) {
    if (gasPrice === null) gasPrice = await this.getGasPrice_Gwei();
    return (gasPrice * gas) / 1e18;
  }

  // BLIND RAISE EVERY 0.2 seconds

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

  /**
   * Replaces all known pending transactions with empty transactions.
   * Intended to be run when terminating the process
   */
  dumpAll() {
    for (let i = 0; i < this._queue.length; i++) this._queue.dump(i);
  }
}

module.exports = TxManager;

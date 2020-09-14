const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;
const winston = require("winston");

// src.messaging
const Candidate = require("../../messaging/candidate");
const Channel = require("../../messaging/channel");
const Message = require("../../messaging/message");
const Oracle = require("../../messaging/oracle");
// src.network.webthree
const TxQueue = require("./txqueue");
const FlashLiquidator = require("./goldenage/flashliquidator");

/**
 * Given a list of liquidatable candidates, TxManager will participate
 * in blind-auction bidding wars and update Open Price Feed prices if
 * necessary for the liquidation.
 *
 * __IPC Messaging:__
 *
 * _Subscriptions:_
 * - Oracles>Set | Sets the txManager's oracle to the one in the message ✅
 * - Candidates>Liquidate | Appends the candidate from the message and
 *    caches an updated transaction to be sent on next bid ✅
 * - Candidates>LiquidateWithPriceUpdate | Same idea, but will make sure
 *    to update Open Price Feed prices ✅
 * - Messages>CheckCandidatesLiquidityComplete | Removes stale candidates
 *    (those that were update more than `msg.__data.time` ms ago)
 *
 * Please call `init()` as soon as possible. Bidding can't happen beforehand.
 */
class TxManager {
  /**
   * @param {Provider} provider the Web3 provider to use for transactions
   * @param {String} envKeyAddress Name of the environment variable containing
   *    the wallet's address
   * @param {String} envKeySecret Name of the environment variable containing
   *    the wallet's private key
   * @param {Number} interval Time between bids (milliseconds)
   * @param {Number} maxFee_Eth The maximum possible tx fee in Eth
   */
  constructor(provider, envKeyAddress, envKeySecret, interval, maxFee_Eth) {
    this._queue = new TxQueue(provider, envKeyAddress, envKeySecret);
    this._oracle = null;

    this._candidates = {};
    this._revenue = 0;
    this._tx = null;

    this.interval = interval;
    this.maxFee_Eth = maxFee_Eth;

    Channel(Oracle).on("Set", oracle => (this._oracle = oracle));
  }

  async init() {
    await this._queue.init();
    await this._queue.rebase();

    Channel(Candidate).on("Liquidate", c => {
      this._storeCandidate(c);
      this._cacheTransaction();
    });
    Channel(Candidate).on("LiquidateWithPriceUpdate", c => {
      this._storeCandidate(c, true);
      this._cacheTransaction();
    });
    Channel(Message).on("CheckCandidatesLiquidityComplete", msg => {
      this._removeStaleCandidates(msg.__data.time);
      this._cacheTransaction();
    });

    this._intervalHandle = setInterval(
      this._periodic.bind(this),
      this.interval
    );
  }

  _storeCandidate(c, needsPriceUpdate = false) {
    const isNew = !(c.address in this._candidates);

    this._candidates[c.address] = {
      repayCToken: c.ctokenidpay,
      seizeCToken: c.ctokenidseize,
      needsPriceUpdate: needsPriceUpdate,
      revenue: Number(c.profitability),
      lastSeen: Date.now()
    };

    if (isNew)
      winston.info(
        `🧮 *TxManager* | Added ${c.label} for revenue of ${c.profitability} Eth`
      );
  }

  _removeStaleCandidates(updatePeriod) {
    const now = Date.now();

    for (let addr in this._candidates) {
      if (now - this._candidates[addr].lastSeen <= updatePeriod) continue;
      delete this._candidates[addr];

      winston.info(`🧮 *TxManager* | Removed ${addr.slice(0, 6)}`);
    }
  }

  async _cacheTransaction() {
    let borrowers = [];
    let repayCTokens = [];
    let seizeCTokens = [];
    let revenue = 0;
    let needPriceUpdate = false;

    let candidates = Object.entries(this._candidates);
    candidates = candidates.sort((a, b) => b[1].revenue - a[1].revenue);

    for (let entry of candidates) {
      const c = entry[1];

      borrowers.push(entry[0]);
      repayCTokens.push(c.repayCToken);
      seizeCTokens.push(c.seizeCToken);
      revenue += c.revenue;
      needPriceUpdate |= c.needsPriceUpdate;
    }

    if (borrowers.length === 0) {
      this._tx = null;
      return;
    }
    // Set expected revenue to the max of the candidate revenues
    this._revenue = candidates[0][1].revenue;
    // To simplify things, we assume that only 1 borrower will be
    // liquidated (the first one in the list) and set the gas limit
    // accordingly. If that borrower can't be liquidated for some
    // reason, the smart contract will handle fallback options, so
    // we don't have to worry about that here.
    const gasLimit = Big(2000000);

    const initialGasPrice =
      this._tx !== null
        ? this._tx.gasPrice
        : (await this._getInitialGasPrice()).times(0.9);

    if (!needPriceUpdate) {
      this._tx = FlashLiquidator.mainnet.liquidateMany(
        borrowers,
        repayCTokens,
        seizeCTokens,
        initialGasPrice
      );
      // Override gas limit
      this._tx.gasLimit = gasLimit;
      return;
    }

    // Technically, if oracle is null and some (but not all) candidates
    // need price updates, we should filter out candidates that need price
    // updates and send the rest using the function above. However, that
    // shoudn't happen very often (`_oracle` is only null on code startup),
    // so it's safe to ignore that case.
    if (this._oracle === null) {
      this._tx = null;
      return;
    }

    const postable = this._oracle.postableData();
    this._tx = FlashLiquidator.mainnet.liquidateManyWithPriceUpdate(
      postable[0],
      postable[1],
      postable[2],
      borrowers,
      repayCTokens,
      seizeCTokens,
      initialGasPrice
    );
    // Override gas limit
    this._tx.gasLimit = gasLimit;
  }

  /**
   * To be called every `this.interval` milliseconds.
   * Sends `this._tx` if non-null and profitable
   * @private
   */
  _periodic() {
    if (this._tx === null) {
      this.dumpAll();
      return;
    }
    this._sendIfProfitable(this._tx);
  }

  /**
   * Sends `tx` to queue as long as its gas price isn't so high that it
   * would make the transaction unprofitable
   * @private
   *
   * @param {Object} tx an object describing the transaction
   */
  _sendIfProfitable(tx) {
    // First, check that current gasPrice is profitable. If it's not (due
    // to network congestion or a recently-removed candidate), then replace
    // any pending transactions with empty ones.
    let fee = TxManager._estimateFee(this._tx);
    if (fee.gt(this.maxFee_Eth) || fee.gt(this._revenue)) {
      this.dumpAll();
      return;
    }

    // If there are no pending transactions, start a new one
    if (this._queue.length === 0) {
      this._queue.append(tx);
      return;
    }

    // If there's already a pending transaction, check whether raising
    // the gasPrice (re-bidding) results in a still-profitable tx. If it
    // does, go ahead and re-bid.
    const newTx = { ...tx };
    // Pass by reference, so after dry run, tx.gasPrice will be updated...
    this._queue.replace(0, newTx, "clip", /*dryRun*/ true);

    fee = TxManager._estimateFee(newTx);
    if (fee.gt(this.maxFee_Eth) || fee.gt(this._revenue)) return;

    this._queue.replace(0, tx, "clip");
    tx.gasPrice = newTx.gasPrice;
  }

  /**
   * Computes `gasPrice * gasLimit` and returns the result in Eth,
   * assuming that `gasPrice` was given in Wei
   * @static
   *
   * @param {Object} tx an object describing the transaction
   * @returns {Big} estimates transaction fee
   */
  static _estimateFee(tx) {
    return tx.gasPrice.times(tx.gasLimit).div(1e18);
  }

  /**
   * Gets the current market-rate gas price from the Web3 provider
   * @private
   *
   * @returns {Big} the gas price in Wei
   */
  async _getInitialGasPrice() {
    return Big(await this._queue._wallet._provider.eth.getGasPrice());
  }

  /**
   * Replaces all known pending transactions with empty transactions.
   * Intended to be run when terminating the process
   */
  dumpAll() {
    for (let i = 0; i < this._queue.length; i++) this._queue.dump(i);
  }

  /**
   * Clears candidates and dumps existing transactions
   */
  reset() {
    this._candidates = {};
    this._revenue = 0.0; // in Eth
    this._tx = null;

    this.dumpAll();
  }

  /**
   * Calls `reset()` to clear candidates and dump transactions,
   * then cancels the periodic bidding function.
   * Should be called before exiting the program
   */
  stop() {
    this.reset();
    clearInterval(this._intervalHandle);
  }
}

module.exports = TxManager;

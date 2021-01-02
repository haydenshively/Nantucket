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
const Liquidator = require("./goldenage/liquidator");

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
 *    (those that were update more than `msg.__data.time` ms ago) ✅
 * - Messages>MissedOpportunity | Not strictly necessary since the above
 *    message would remove stale candidates eventually, but this will take
 *    care of some of them faster ✅
 *
 * Please call `init()` as soon as possible. Bidding can't happen beforehand.
 */
class TxManager {
  /**
   * @param {TxQueue} queue The TxQueue to use
   * @param {Number} interval Time between bids (milliseconds)
   * @param {Number} maxFee_Eth The maximum possible tx fee in Eth
   */
  constructor(queue, interval, maxFee_Eth) {
    this._queue = queue;
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
    Channel(Message).on("MissedOpportunity", msg => {
      this._removeCandidate(msg.__data.address);
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
      markets: c.markets,
      lastSeen: Date.now()
    };

    if (isNew) {
      winston.info(
        `🐳 *TxManager* | Added ${c.label} for revenue of ${c.profitability} Eth`
      );
      if (Number(c.profitability) >= this._revenue)
        winston.info(`✨ *TxManager* | ${c.label} will become primary target`);
    }
  }

  _removeCandidate(address) {
    const isOld = address.toLowerCase() in this._candidates;
    delete this._candidates[address.toLowerCase()];

    if (isOld) winston.info(`🧮 *TxManager* | Removed ${address.slice(0, 6)}`);
  }

  _removeStaleCandidates(updatePeriod) {
    const now = Date.now();

    for (let addr in this._candidates) {
      if (now - this._candidates[addr].lastSeen <= updatePeriod) continue;
      this._removeCandidate(addr);
    }
  }

  async _cacheTransaction() {
    let borrowers = [];
    let repayCTokens = [];
    let seizeCTokens = [];
    let revenue = 0;

    let candidates = Object.entries(this._candidates);
    candidates = candidates.sort((a, b) => b[1].revenue - a[1].revenue);

    for (let entry of candidates) {
      const c = entry[1];

      borrowers.push(entry[0]);
      repayCTokens.push(c.repayCToken);
      seizeCTokens.push(c.seizeCToken);
      revenue += c.revenue;
    }

    if (borrowers.length === 0 || this._oracle === null) {
      this._tx = null;
      this._revenue = 0;
      return;
    }

    // NOTE: right now, we assume that only 1 borrower will be liquidated
    // (the first one in the list). We let Liquidator.js set the gas limit
    // accordingly. If that borrower can't be liquidated for some reason,
    // the smart contract will handle fallback options, so we don't have to
    // worry about that here
    // Set expected revenue to the max of the candidate revenues
    revenue = candidates[0][1].revenue;

    const postable = this._oracle.postableDataFor(candidates[0][1].markets);
    // TODO this check shouldn't be necessary (except for the null part)
    if (
      postable === null ||
      postable[0].length !== postable[1].length ||
      postable[1].length !== postable[2].length
    ) {
      console.error("Error: Postable=null or components have varying lengths");
      this._tx = null;
      this._revenue = 0;
      return;
    }

    let tx = null;
    if (postable[0].length === 0)
      tx = Liquidator.mainnet.liquidateS(
        borrowers[0],
        repayCTokens[0],
        seizeCTokens[0]
      );
    else
      tx = Liquidator.mainnet.liquidateSWithPrice(
        postable[0],
        postable[1],
        postable[2],
        borrowers[0],
        repayCTokens[0],
        seizeCTokens[0]
      );

    // Override gas limit
    // Since estimation is made under the assumption that pending txns have gone
    // through, it may severely underestimate liquidation gas after an initial
    // bid has been made. As such, only re-estimate if primary candidate changes.

    let estimated;
    try {
      estimated = Big(await this._queue._wallet.estimateGas(tx)).mul(1.06);
    } catch (e) {
      console.error("Error: Revert during gas estimation:");
      console.log(e.name + " " + e.message);
      this._removeCandidate(borrowers[0]);
      this._tx = null;
      this._revenue = 0;
      return;
    }
    tx.gasLimit = estimated.gt(tx.gasLimit) ? estimated : tx.gasLimit;

    // Override gas price
    if (
      this._tx === null ||
      this._tx.gasPrice === undefined ||
      this._tx.data !== tx.data
    )
      tx.gasPrice = await this._getInitialGasPrice(tx.gasLimit.mul(0.75), revenue);
    else tx.gasPrice = this._tx.gasPrice;

    // Save to cached tx. Must be done at the end like this so that
    // tx is always null or fully defined, not partially defined
    this._tx = tx;
    this._revenue = revenue;
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
    // These checks are just an extra precaution
    if (this._tx.gasPrice === undefined) {
      console.error("TxManager's periodic function saw an undefined gas price");
      return;
    }
    if (this._tx.gasLimit.lte("500000")) {
      console.error(
        `TxManager periodic got low gas limit ${this._tx.gasLimit.toFixed(0)}`
      );
      this._tx = null;
      this._revenue = 0;
      return;
    }
    // Go ahead and send!
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
    let fee = TxManager._estimateFee(tx).mul(0.75);
    if (fee.gt(this.maxFee_Eth) || fee.gt(this._revenue)) {
      winston.info("🧮 *TxManager* | Dumping (active tx no longer profitable)");
      this._tx = null;
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
    // .mul(1.0) to ensure we get a copy of the gasPrice and not a reference
    const oldGasPrice = tx.gasPrice.mul(1.0);
    // Pass by reference, so after dry run, tx.gasPrice will be updated...
    this._queue.replace(0, tx, "clip", /*dryRun*/ true);

    fee = TxManager._estimateFee(tx).mul(0.75);
    if (fee.gt(this.maxFee_Eth) || fee.gt(this._revenue)) {
      tx.gasPrice = oldGasPrice;
      return;
    }

    this._queue.replace(0, tx, "clip");
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
   * Gets the current market-rate gas price from the Web3 provider,
   * then adjusts it so that it lies on the exponential curve that
   * leads to the maximum possible gas price (assuming constant 12%
   * bid raises)
   * @private
   *
   * @param gasLimit {Big} the gas limit of the proposed transaction
   * @param revenue {Number} the expected revenue from proposed tx (in Eth)
   * @returns {Promise<Big>} the gas price in Wei
   */
  async _getInitialGasPrice(gasLimit, revenue) {
    const maxGasPrice = Big(Math.min(revenue, this.maxFee_Eth))
      .times(1e18)
      .div(gasLimit);

    let gasPrice = Big(await this._queue._wallet._provider.eth.getGasPrice());
    if (gasPrice.gte(maxGasPrice)) gasPrice;

    let n = 0;
    while (gasPrice.lt(maxGasPrice)) {
      gasPrice = gasPrice.times(1.12);
      n++;
    }
    // log base 1.12 of 2 is 6.11625. If it's profitable to start bidding at
    // twice the market rate, this'll do that
    if (n > 6.11625) n -= 6.11625;

    return maxGasPrice.div(Math.pow(1.12, n));
    /*
    TODO
    
    Note that this will only force the exponential thing for the _first_ candidate
    that gets sent off to the smart contract. If more candidates are added to
    later bids, the condition no longer necessarily holds.

    To make it apply to those cases as well, (1) the logic would have to be moved
    elsewhere (probably to the `cacheTransaction` function) and (2) upon addition of
    a new candidate, check whether that new candidate is the most profitable
    (idx 0 in the `borrowers` array). If it is, then have some logic that decides
    whether hopping up to a new exponential curve makes sense given how close/far
    we are from `maxFee`
    */
  }

  /**
   * Replaces all known pending transactions with empty transactions.
   * Intended to be run when terminating the process
   */
  dumpAll() {
    for (let i = 0; i < this._queue.length; i++) this._queue.dump(i);
  }

  /**
   * Cancels the periodic bidding function and dumps txns.
   * Should be called before exiting the program
   */
  stop() {
    clearInterval(this._intervalHandle);
    this.dumpAll();
  }
}

module.exports = TxManager;

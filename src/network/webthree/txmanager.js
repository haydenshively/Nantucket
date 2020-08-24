const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

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
 * - Messages>NewBlock | Calls `reset()` (clears candidates and dumps txs) ✅
 *    _currently disabled_
 * - Messages>MissedOpportunity | Removes the borrower given by
 *    `msg.__data.address` and caches an updated transaction. If the
 *    borrower was the only one, the next transaction will be an empty
 *    replacement ✅
 * - Oracles>Set | Sets the txManager's oracle to the one in the message ✅
 * - Candidates>Liquidate | Appends the candidate from the message and
 *    caches an updated transaction to be sent on next bid ✅
 * - Candidates>LiquidateWithPriceUpdate | Same idea, but will make sure
 *    to update Open Price Feed prices ✅
 *
 * Please call `init()` as soon as possible. Bidding can't happen beforehand.
 */
class TxManager {
  /**
   * @param {String} envKeyAddress Name of the environment variable containing
   *    the wallet's address
   * @param {String} envKeySecret Name of the environment variable containing
   *    the wallet's private key
   * @param {Number} interval Time between bids (milliseconds)
   * @param {Number} maxFee_Eth The maximum possible tx fee in Eth
   */
  constructor(envKeyAddress, envKeySecret, interval, maxFee_Eth) {
    this._queue = new TxQueue(envKeyAddress, envKeySecret);
    this._oracle = null;

    // These variables get updated any time a new candidate is received
    this._borrowers = [];
    this._repayCTokens = [];
    this._seizeCTokens = [];
    this._idxsNeedingPriceUpdate = [];
    this._profitabilities = {};
    this._profitability = 0.0; // in Eth, modify in tandem with _profitabilities
    this._tx = null;

    this.interval = interval;
    this.maxFee_Eth = maxFee_Eth;

    // Channel(Message).on("NewBlock", _ => this.reset());
    Channel(Oracle).on("Set", oracle => (this._oracle = oracle));
  }

  async init() {
    await this._queue.rebase();

    Channel(Candidate).on("Liquidate", c => {
      // prevent duplicates
      if (c.address in this._profitabilities) return;
      this._appendCandidate(c);
      this._cacheTransaction();
    });
    Channel(Candidate).on("LiquidateWithPriceUpdate", c => {
      // prevent duplicates
      if (c.address in this._profitabilities) return;
      this._appendCandidate(c, true);
      this._cacheTransaction();
    });
    // TODO the following Message is currently the only way that
    // candidates get removed & empty transactions get sent to
    // replace failed liquidations. In theory it's good enough,
    // but it may be good to have some other safe guard.
    Channel(Message).on("MissedOpportunity", msg => {
      console.log("Received missed op msg for " + msg.__data.address);
      this._removeCandidate(msg.__data.address);
      this._cacheTransaction();
    });

    this._intervalHandle = setInterval(
      this._periodic.bind(this),
      this.interval
    );
  }

  _appendCandidate(c, needsPriceUpdate = false) {
    const idx = this._borrowers.push(c.address);
    this._repayCTokens.push(c.ctokenidpay);
    this._seizeCTokens.push(c.ctokenidseize);

    if (needsPriceUpdate) this._idxsNeedingPriceUpdate.push(idx);

    // TODO for now profitability is still in ETH since Compound's API
    // is in ETH, but that may change now that the oracle is in USD
    this._profitabilities[c.address] = Number(c.profitability);
    this._profitability += this._profitabilities[c.address];
    console.log(
      `Candidate ${c.label} was added for a new profit of ${this._profitability}`
    );
  }

  _removeCandidate(address) {
    for (let i = 0; i < this._borrowers.length; i++) {
      if (this._borrowers[i] !== address) continue;

      this._borrowers.splice(i, 1);
      this._repayCTokens.splice(i, 1);
      this._seizeCTokens.splice(i, 1);

      this._idxsNeedingPriceUpdate = this._idxsNeedingPriceUpdate.filter(
        idx => idx !== i
      );

      // The only time this should be false is if _removeCandidate gets
      // called twice for some reason. This could happen if a block
      // containing a liquidation got re-ordered, for example.
      if (address in this._profitabilities) {
        this._profitability -= this._profitabilities[address];
        delete this._profitabilities[c.address];
      }
      return;
    }
  }

  async _cacheTransaction() {
    // Profitability should never be less than 0, but just in case...
    // TODO (this is probably something we should test. if it's ever
    // negative then there's a bug somewhere)
    if (this._profitability <= 0.0 || this._borrowers.length === 0) {
      this._tx = null;
      return;
    }
    const initialGasPrice = await this._getInitialGasPrice();

    if (this._idxsNeedingPriceUpdate.length === 0) {
      this._tx = await FlashLiquidator.mainnet.liquidateMany(
        this._borrowers,
        this._repayCTokens,
        this._seizeCTokens,
        initialGasPrice
      );
      return;
    }

    // TODO if oracle is null and some (but not all) candidates
    // need price updates, we should do the above code with filtered
    // versions of the lists, rather than just returning like the code below
    if (this._oracle === null) return;

    const postable = this._oracle.postableData();
    this._tx = await FlashLiquidator.mainnet.liquidateManyWithPriceUpdate(
      postable[0],
      postable[1],
      postable[2],
      this._borrowers,
      this._repayCTokens,
      this._seizeCTokens,
      initialGasPrice
    );
  }

  /**
   * To be called every `this.interval` milliseconds.
   * Sends `this._tx` if profitable and non-null
   * @private
   */
  _periodic() {
    if (this._tx === null) {
      this.dumpAll();
      return;
    }
    // TODO hot fix for massive losses
    if (
      Big(web3.utils.hexToNumberString(this._tx.gasLimit)).lte(
        500000 * this._borrowers.length
      )
    ) {
      this.dumpAll();
      return;
    }
    // TODO edge case: it's possible that the tx could be non-null,
    // but due to a recent candidate removal, the current gasPrice&gasLimit
    // create a no-longer-profitable situation. In this case, any pending
    // tx should be replaced with an empty tx, but `_sendIfProfitable` doesn't
    // do that. It will only see that a gasPrice raise isn't possible, and
    // give up
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
    if (this._queue.length === 0) {
      this._queue.append(tx);
      return;
    }

    this._queue.replace(0, tx, "clip", /*dryRun*/ true);
    // After dry run, tx.gasPrice will be updated...
    const fee = TxManager._estimateFee(tx);
    console.log([fee.toFixed(5), this._profitability]);
    if (fee.gt(this.maxFee_Eth) || fee.gt(this._profitability)) return;
    console.log("Increasing bid");
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
    const gasLimit = Big(web3.utils.hexToNumberString(tx.gasLimit));
    return tx.gasPrice.times(gasLimit).div(1e18);
  }

  /**
   * Gets the current market-rate gas price from the Web3 provider
   * @private
   *
   * @returns {Big} the gas price in Wei
   */
  async _getInitialGasPrice() {
    return Big(await web3.eth.getGasPrice());
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
    this._borrowers = [];
    this._repayCTokens = [];
    this._seizeCTokens = [];
    this._idxsNeedingPriceUpdate = [];
    this._profitabilities = {};
    this._profitability = 0.0; // in Eth
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

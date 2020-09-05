import Web3Utils from "web3-utils";
import Big from "../../big";

// src.messaging
import Candidate from "../../messaging/candidate";
import Channel from "../../messaging/channel";
import Message from "../../messaging/message";
import Oracle from "../../messaging/oracle";
// src.network.webthree
import TxQueue from "./txqueue";
import FlashLiquidator from "./goldenage/flashliquidator";
import { EthNet } from "./ethnet";

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
export default class TxManager {

  public interval: any;
  public maxFeeEth: any;

  private queue: TxQueue;
  private oracle: Oracle;
  private borrowers: any;
  private repayCTokens: any;
  private seizeCTokens: any;
  private idxsNeedingPriceUpdate: any;
  private profitabilities: any;
  private profitability: any;
  private tx: any;
  private intervalHandle: any;

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
    this.queue = new TxQueue(provider, envKeyAddress, envKeySecret);
    this.oracle = null;

    // These variables get updated any time a new candidate is received
    this.borrowers = [];
    this.repayCTokens = [];
    this.seizeCTokens = [];
    this.idxsNeedingPriceUpdate = [];
    this.profitabilities = {};
    this.profitability = 0.0; // in Eth, modify in tandem with _profitabilities
    this.tx = null;

    this.interval = interval;
    this.maxFeeEth = maxFee_Eth;

    // Channel(Message).on("NewBlock", _ => this.reset());
    Channel.for(Oracle).on("Set", oracle => (this.oracle = oracle));
  }

  async init() {
    await this.queue.init();
    await this.queue.rebase();

    Channel.for(Candidate).on("Liquidate", c => {
      // prevent duplicates
      if (c.address in this.profitabilities) return;
      this._appendCandidate(c);
      this._cacheTransaction();
    });
    Channel.for(Candidate).on("LiquidateWithPriceUpdate", c => {
      // prevent duplicates
      if (c.address in this.profitabilities) return;
      this._appendCandidate(c, true);
      this._cacheTransaction();
    });
    // TODO the following Message is currently the only way that
    // candidates get removed & empty transactions get sent to
    // replace failed liquidations. In theory it's good enough,
    // but it may be good to have some other safe guard.
    Channel.for(Message).on("MissedOpportunity", msg => {
      console.log("Received missed op msg for " + msg.__data.address);
      this._removeCandidate(msg.__data.address);
      this._cacheTransaction();
    });

    this.intervalHandle = setInterval(
      this._periodic.bind(this),
      this.interval
    );
  }

  _appendCandidate(c, needsPriceUpdate = false) {
    const idx = this.borrowers.push(c.address);
    this.repayCTokens.push(c.ctokenidpay);
    this.seizeCTokens.push(c.ctokenidseize);

    if (needsPriceUpdate) this.idxsNeedingPriceUpdate.push(idx);

    // TODO for now profitability is still in ETH since Compound's API
    // is in ETH, but that may change now that the oracle is in USD
    this.profitabilities[c.address] = Number(c.profitability);
    this.profitability += this.profitabilities[c.address];
    console.log(
      `Candidate ${c.label} was added for a new profit of ${this.profitability}`
    );
  }

  _removeCandidate(address) {
    for (let i = 0; i < this.borrowers.length; i++) {
      if (this.borrowers[i] !== address) continue;

      this.borrowers.splice(i, 1);
      this.repayCTokens.splice(i, 1);
      this.seizeCTokens.splice(i, 1);

      this.idxsNeedingPriceUpdate = this.idxsNeedingPriceUpdate.filter(
        idx => idx !== i
      );

      // The only time this should be false is if _removeCandidate gets
      // called twice for some reason. This could happen if a block
      // containing a liquidation got re-ordered, for example.
      if (address in this.profitabilities) {
        this.profitability -= this.profitabilities[address];
        // TODO: Inspect changes on this line.
        // Used to be:
        // delete this.profitabilities[c.address];
        // But c is not defined in this scope.
        delete this.profitabilities[address];
      }
      return;
    }
  }

  async _cacheTransaction() {
    // Profitability should never be less than 0, but just in case...
    // TODO (this is probably something we should test. if it's ever
    // negative then there's a bug somewhere)
    if (this.profitability <= 0.0 || this.borrowers.length === 0) {
      this.tx = null;
      return;
    }
    const initialGasPrice = await this._getInitialGasPrice();

    if (this.idxsNeedingPriceUpdate.length === 0) {
      this.tx = await FlashLiquidator.forNet(EthNet.mainnet).liquidateMany(
        this.borrowers,
        this.repayCTokens,
        this.seizeCTokens,
        initialGasPrice
      );
      return;
    }

    // TODO if oracle is null and some (but not all) candidates
    // need price updates, we should do the above code with filtered
    // versions of the lists, rather than just returning like the code below
    if (this.oracle === null) return;

    const postable = this.oracle.postableData();
    this.tx = await FlashLiquidator.forNet(EthNet.mainnet).liquidateManyWithPriceUpdate(
      postable[0],
      postable[1],
      postable[2],
      this.borrowers,
      this.repayCTokens,
      this.seizeCTokens,
      initialGasPrice
    );
  }

  /**
   * To be called every `this.interval` milliseconds.
   * Sends `this._tx` if profitable and non-null
   * @private
   */
  _periodic() {
    if (this.tx === null) {
      this.dumpAll();
      return;
    }
    // TODO edge case: it's possible that the tx could be non-null,
    // but due to a recent candidate removal, the current gasPrice&gasLimit
    // create a no-longer-profitable situation. In this case, any pending
    // tx should be replaced with an empty tx, but `_sendIfProfitable` doesn't
    // do that. It will only see that a gasPrice raise isn't possible, and
    // give up
    this._sendIfProfitable(this.tx);
  }

  /**
   * Sends `tx` to queue as long as its gas price isn't so high that it
   * would make the transaction unprofitable
   * @private
   *
   * @param {Object} tx an object describing the transaction
   */
  _sendIfProfitable(tx) {
    if (this.queue.length === 0) {
      this.queue.append(tx);
      return;
    }

    this.queue.replace(0, tx, "clip", /*dryRun*/ true);
    // After dry run, tx.gasPrice will be updated...
    const fee = TxManager._estimateFee(tx);
    console.log([fee.toFixed(5), this.profitability]);
    if (fee.gt(this.maxFeeEth) || fee.gt(this.profitability)) return;
    console.log("Increasing bid");
    this.queue.replace(0, tx, "clip");
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
    return Big(await this.queue._wallet._provider.eth.getGasPrice());
  }

  /**
   * Replaces all known pending transactions with empty transactions.
   * Intended to be run when terminating the process
   */
  dumpAll() {
    for (let i = 0; i < this.queue.length; i++) this.queue.dump(i);
  }

  /**
   * Clears candidates and dumps existing transactions
   */
  reset() {
    this.borrowers = [];
    this.repayCTokens = [];
    this.seizeCTokens = [];
    this.idxsNeedingPriceUpdate = [];
    this.profitabilities = {};
    this.profitability = 0.0; // in Eth
    this.tx = null;

    this.dumpAll();
  }

  /**
   * Calls `reset()` to clear candidates and dump transactions,
   * then cancels the periodic bidding function.
   * Should be called before exiting the program
   */
  stop() {
    this.reset();
    clearInterval(this.intervalHandle);
  }
}

const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;
const winston = require("winston");

class TxQueue {
  constructor(wallet, revertTolerance = 2) {
    this._wallet = wallet;
    this._revertTolerance = 2;

    this._lowestLiquidNonce = 0;
    this._revertCount = 0;
    this._queue = [];
  }

  async init() {
    return this._wallet.init();
  }

  /**
   * The number of transactions being managed by this queue
   *
   * @returns {Number} queue length
   */
  get length() {
    return this._queue.length;
  }

  /**
   * Gets the most recent transaction at a given index
   *
   * @param {Number} idx a queue index
   * @returns {Object} an object describing the transaction
   */
  tx(idx) {
    return this._queue[idx];
  }

  /**
   * The nonce corresponding to the given queue index
   *
   * @param {Number} idx a queue index
   */
  nonce(idx) {
    return this._lowestLiquidNonce + idx;
  }

  /**
   * The queue index corresponding to the given nonce.
   * CAUTION: May return an index that's not yet in the queue
   *
   * @param {Number} nonce a nonce
   */
  idx(nonce) {
    return nonce - this._lowestLiquidNonce;
  }

  /**
   * Asks network what the account's next unconfirmed nonce is and
   * updates `this._lowestLiquidNonce`
   *
   * If the nonce has increased, `rebase()` will remove confirmed
   * transactions from the queue
   */
  async rebase() {
    const diff =
      (await this._wallet.getLowestLiquidNonce()) - this._lowestLiquidNonce;
    this._queue.splice(0, diff); // Could log confirmed txs via returned array slice
    this._lowestLiquidNonce += diff;
  }

  /**
   * Estimates the gas necessary to send a given transaction
   *
   * @param {Object} tx an object describing the transaction
   * @param {Number} idx a queue index, defaults to 0
   * @returns {Promise<Number>} estimated amount of gas that the tx will require
   *
   */
  estimateGas(tx, idx = 0) {
    return this._wallet.estimateGas(tx, this.nonce(idx));
  }

  /**
   * Add a transaction to the queue. Gas price must be specified.
   *
   * @param {Object} tx an object describing the transaction
   *
   * @example
   * // Send the following tx
   * const tx = {
   *  gasPrice: Big("21000000000"),
   *  gasLimit: '0x2710',
   *  to: '0x0000...',
   *  value: '0x00',
   *  data: '0x7f74657374320...',
   * };
   * txQueue.append(tx);
   */
  append(tx) {
    const idx = this._queue.push(tx) - 1;
    this._broadcast(idx);
  }

  /**
   * Replace an existing transaction with a new one
   *
   * @param {Number} idx a queue index
   * @param {Object} tx an object describing the transaction
   * @param {String} gasPriceMode how to update the gas price:
   *    `"as_is"`: use gas price specified in the `tx` arg
   *    `"clip"`: `Math.max(minGasPrice, tx.gasPrice)`
   *    `"min"`: use minimum gas price needed to replace existing txs
   * @param {Boolean} dryRun default false; if true, update tx gas price
   *    without actually adding to the queue or sending
   *
   * @example
   * // Replace the proximal tx with the following
   * const tx = {
   *  gasLimit: '0x2710',
   *  to: '0x0000...',
   *  value: '0x00',
   *  data: '0x7f74657374320...',
   * };
   * txQueue.replace(0, tx, "min");
   */
  replace(idx, tx, gasPriceMode, dryRun = false) {
    switch (gasPriceMode) {
      case "as_is":
        break;
      case "clip":
        const minGasPrice = this._wallet.minGasPriceFor(this.nonce(idx));
        if (tx.gasPrice.gt(minGasPrice)) break;
      case "min":
        tx.gasPrice = minGasPrice;
    }

    if (dryRun) return;
    this._queue[idx] = tx;
    this._broadcast(idx);
  }

  /**
   * Set the given index to an empty transaction. Raises the gas price
   * as little as possible.
   *
   * @param {Number} idx a queue index
   */
  dump(idx) {
    // NOTE Just because the gasLimit matches that of an empty tx doesn't
    // necessarily mean it's an empty tx. However, the use case of Nantucket
    // is limiting enough that we can make this assumption. TODO if using
    // this class elsewhere/for other projects, make sure to have stricter
    // matching/checking
    if (this._queue[idx].gasLimit.eq("21000")) return;
    this._queue[idx] = this._wallet.emptyTx;
    this._queue[idx].gasPrice = this._wallet.minGasPriceFor(this.nonce(idx));
    this._broadcast(idx);
  }

  _broadcast(idx) {
    const tx = this._queue[idx];
    const nonce = this.nonce(idx);
    const sentTx = this._wallet.signAndSend(tx, nonce);

    this._setupTxEvents(sentTx, nonce);
  }

  _setupTxEvents(sentTx, nonce) {
    const label = `💸 *Transaction* | ${this._wallet.label}:${nonce} `;

    // After receiving the transaction hash, log its Etherscan link
    sentTx.on("transactionHash", hash => {
      winston.info(`${label}On <https://etherscan.io/tx/${hash}|etherscan>`);
    });
    // After receiving receipt, log success and rebase
    sentTx.on("receipt", receipt => {
      sentTx.removeAllListeners();
      winston.info(`${label}Successful at block ${receipt.blockNumber}!`);
      this.rebase();
    });
    // After receiving an error, check if it occurred on or off chain
    sentTx.on("error", (err, receipt) => {
      sentTx.removeAllListeners();
      // If it occurred on-chain, receipt will be defined.
      // Treat it the same as the successful receipt case.
      if (receipt !== undefined) {
        winston.info(label + "Reverted");
        this.rebase();

        // Escape hatch
        this._revertCount++;
        if (this._revertCount >= this._revertTolerance) {
          winston.info("TxQueue saw too many reverts. Shutting down.");
          process.exit();
        }
        return;
      }
      const errStr = String(err);
      // Certain off-chain errors also indicate that we may need to rebase
      // our nonce. Check those:
      if (
        errStr.includes("replacement transaction underpriced") ||
        errStr.includes("already known")
      ) {
        winston.info(label + "Attempting rebase");
        this.rebase();
      }
      // Certain errors are expected (and handled naturally by structure
      // of this queue) so we don't need to log them:
      if (!errStr.includes("Transaction was not mined within "))
        winston.error(label + "Off-chain " + errStr);
    });
  }
}

module.exports = TxQueue;

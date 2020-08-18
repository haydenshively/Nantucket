const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Tx = require("ethereumjs-tx").Transaction;

class Wallet {
  /**
   * Constructs a new Wallet instance
   *
   * @param {String} envKeyAddress name of env variable containing the address
   * @param {String} envKeySecret name of env variable containing private key
   */
  constructor(envKeyAddress, envKeySecret) {
    this._envKeyAddress = envKeyAddress;
    this._envKeySecret = envKeySecret;

    // Nothing is ever deleted from _gasPrices. If this code were
    // to run forever, this would cause memory to grow forever (very slowly).
    this._gasPrices = {};

    this.label = String(process.env[envKeyAddress]).slice(0, 6);
    this.emptyTx = {
      gasLimit: web3.utils.toHex("21000"),
      to: process.env[envKeyAddress],
      value: web3.utils.toHex("0")
    };
  }

  /**
   * Gets the minimum gas price necessary to submit or replace a transaction.
   * 
   * CAUTION: If a transaction was submitted by means other than this Wallet
   * code, the returned number could be inaccurate.
   *
   * @param {Number} nonce the transaction's nonce, as an integer (base 10)
   * @returns {Big} smallest gas price that would allow the nonce into the mempool
   */
  minGasPriceFor(nonce) {
    return nonce in this._gasPrices
      ? this._gasPrices[nonce].times(1.12)
      : Big(0);
  }

  /**
   * Signs and sends a transaction
   *
   * @param {Object} tx an object describing the transaction
   * @param {Number} nonce the transaction's nonce, as an integer (base 10)
   * @returns {PromiEvent} See [here](https://web3js.readthedocs.io/en/v1.2.0/callbacks-promises-events.html#promievent)
   *
   * @example
   * // Send the following tx with nonce 0
   * const tx = {
   *  gasPrice: Big("21000000000"),
   *  gasLimit: '0x2710',
   *  to: '0x0000...',
   *  value: '0x00',
   *  data: '0x7f74657374320...',
   * };
   * const sentTx = wallet.signAndSend(tx, 0);
   */
  signAndSend(tx, nonce) {
    tx = { ...tx };
    if ("gasPrice" in tx) this._gasPrices[nonce] = tx.gasPrice;

    tx.nonce = web3.utils.toHex(nonce);
    tx.gasPrice = web3.utils.toHex(tx.gasPrice.toFixed(0));
    return Wallet._send(this._sign(tx));
  }

  /**
   * Signs a transaction with the wallet's private key
   * @private
   *
   * @param {Object} tx an object describing the transaction to sign
   * @returns {String} the serialized signed transaction
   *
   * @example
   * const tx = {
   *  nonce: '0x00',
   *  gasPrice: '0x09184e72a000',
   *  gasLimit: '0x2710',
   *  to: '0x0000...',
   *  value: '0x00',
   *  data: '0x7f74657374320...',
   * };
   * const signedTx = wallet._sign(tx);
   */
  _sign(tx) {
    // Set tx.from here since it must be signed by its sender.
    // i.e. this is the only valid value for tx.from
    tx.from = process.env[this._envKeyAddress];
    tx = new Tx(tx); // Could add chain/hardfork specifics here
    tx.sign(Buffer.from(process.env[this._envKeySecret], "hex"));
    return "0x" + tx.serialize().toString("hex");
  }

  /**
   * Sends a signed transaction
   * @private
   *
   * @param {String} signedTx a transaction that's been signed by this wallet
   * @returns {PromiEvent} See [here](https://web3js.readthedocs.io/en/v1.2.0/callbacks-promises-events.html#promievent)
   */
  static _send(signedTx) {
    return web3.eth.sendSignedTransaction(signedTx);
  }

  /**
   * Convenience function that calls `web3.eth.getTransactionCount`
   *
   * @returns {Promise} the next unconfirmed (possibly pending) nonce (base 10)
   */
  async getLowestLiquidNonce() {
    return web3.eth.getTransactionCount(process.env[this._envKeyAddress]);
  }
}

module.exports = Wallet;

const Tx = require("ethereumjs-tx").Transaction;

class TxManager {
  constructor(envKeyAddress, envKeySecret, maxInProgressTxs = 5) {
    this._envKeyAddress = envKeyAddress;
    this._envKeySecret = envKeySecret;

    this._maxInProgressTxs = maxInProgressTxs;
    this._numInProgressTxs = 0;

    this._nextNonce = null;
    this._queue = [];
    this._gasPrices = {};
  }

  async init() {
    if (this._nextNonce !== null) {
      console.error("Already initialized TxManager. Aborting");
      return;
    }

    this._nextNonce = await web3.eth.getTransactionCount(
      process.env[this._envKeyAddress]
    );

    // TODO web3 returns empty tx array, even before filtering
    // (await TxManager._getPendingTxsFrom(process.env[this._envKeyAddress]))
    //   .sort((a, b) => a.nonce - b.nonce)
    //   .forEach(tx => {
    //     this.insert({
    //       to: tx.to,
    //       gas: tx.gas,
    //       gasPrice: tx.gasPrice,
    //       data: tx.input,
    //       value: tx.value
    //     });
    //   });
  }

  insert(tx, priority = 0, timeout = 60 * 1000) {
    /**
     * Adds a new transaction to the wallet's queue (even if it's a duplicate)
     *
     * @param {object} tx The transaction object {to, gas, gasPrice, data, value}
     * @param {number} priority Sorting criteria. Higher priority txs go first
     *
     */
    // add tx to queue
    this._queue.push({
      id: null,
      tx: tx,
      priority: priority,
      inProgress: false,
      timeout: timeout
    });
    // if the priority is nonzero, sort queue
    if (priority) this._queue.sort((a, b) => b.priority - a.priority);

    this._maximizeNumInProgressTxs();
  }

  _maximizeNumInProgressTxs() {
    for (let i = 0; i < this._queue.length; i++) {
      if (this._numInProgressTxs === this._maxInProgressTxs) break;

      if (!this._queue[i].inProgress) {
        // set tx nonce
        this._queue[i].inProgress = true;
        this._queue[i].id = this._nextNonce;
        this._nextNonce++;
        // send tx and setup its callback events
        const sentTx = this._signAndSend(this._queue[i].tx, this._queue[i].id);
        const handle = setInterval(
          this._onTxErrorFor.bind(this),
          this._queue[i].timeout,
          this._queue[i].id
        );
        this._setupTxEvents(sentTx, this._queue[i].id, handle);
        // now that tx is in progress, update state
        this._numInProgressTxs++;
      }
    }
  }

  _setupTxEvents(sentTx, nonce, setIntervalHandle) {
    const label = `Tx ${nonce} from ${process.env[this._envKeyAddress]}: `;

    sentTx.on("transactionHash", transactionHash => {
      console.log(label + "received hash");
    });
    sentTx.on("receipt", receipt => {
      clearInterval(setIntervalHandle);
      console.log(label + "received receipt");
      this._onTxReceiptFor(nonce);
    });
    sentTx.on("error", (error, receipt) => {
      clearInterval(setIntervalHandle);
      if (receipt !== undefined) {
        console.log(label + "received receipt");
        this._onTxReceiptFor(nonce);
        return;
      }
      console.error(label + "received error");
      this._onTxErrorFor(nonce);
    });
  }

  _onTxReceiptFor(nonce) {
    delete this._gasPrices[nonce];
    this._queue = this._queue.filter(tx => tx.id !== nonce);
    this._numInProgressTxs--;
    this._maximizeNumInProgressTxs();
  }

  _onTxErrorFor(nonce) {
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
    this._maximizeNumInProgressTxs();
  }

  // _emptyTx(gasPrice) {
  //   return {
  //     to: process.env[this._envKeyAddress],
  //     gas: 21000,
  //     gasPrice: gasPrice,
  //     value: 0
  //   };
  // }

  _signAndSend(tx, nonce) {
    if (nonce in this._gasPrices)
      tx.gasPrice = Math.max(tx.gasPrice, this._gasPrices[nonce] + 100);
    this._gasPrices[nonce] = tx.gasPrice;

    tx.nonce = web3.utils.toHex(nonce);
    tx.from = process.env[this._envKeyAddress];
    tx.gasPrice = web3.utils.toHex(Math.floor(tx.gasPrice));
    return TxManager._send(this._sign(tx));
  }

  _sign(tx) {
    tx = new Tx(tx); // Could add chain/hardfork specifics here
    tx.sign(Buffer.from(process.env[this._envKeySecret], "hex"));
    return "0x" + tx.serialize().toString("hex");
  }

  static _send(signedTx) {
    return web3.eth.sendSignedTransaction(signedTx);
  }

  static async _getPendingTxsFrom(address) {
    return (await web3.eth.getPendingTransactions()).filter(
      tx => tx.from === address
    );
  }
}

module.exports = TxManager;

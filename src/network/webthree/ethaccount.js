const Tx = require("ethereumjs-tx").Transaction;

class EthAccount {
  constructor() {
    if (!EthAccount.shared) {
      this.pendingTransactions = {};
      EthAccount.shared = this;
    }
  }

  static getHighestConfirmedNonce() {
    return web3.eth.getTransactionCount(process.env.ACCOUNT_PUBLIC_KEY);
  }

  static _sign(transaction) {
    const tx = new Tx(transaction); // Could add chain/hardfork specifics here
    tx.sign(Buffer.from(process.env.ACCOUNT_PRIVATE_KEY, "hex"));
    return "0x" + tx.serialize().toString("hex");
  }

  static _send(signedTx) {
    return web3.eth.sendSignedTransaction(signedTx);
  }

  static signAndSend(transaction, nonce) {
    transaction.from = process.env.ACCOUNT_PUBLIC_KEY;
    transaction.nonce = web3.utils.toHex(nonce);

    if (nonce in this.pendingTransactions) {
      const currentGasPrice = this.pendingTransactions[nonce].gasPrice;
      if (transaction.gasPrice <= currentGasPrice) {
        console.error("Failed to override transaction. Gas price too low.");
        return;
      }
      console.warn("Overriding transaction with nonce ${nonce}.");
    }

    const sentTx = this._send(this._sign(transaction));
    sentTx.on("sent", payload => {
      this.pendingTransactions[nonce] = {
        to: transaction.to,
        gas: transaction.gas,
        gasPrice: transaction.gasPrice,
        data: transaction.data,
        value: transaction.value
      };
    });
    sentTx.on("transactionHash", transactionHash => {
      this.pendingTransactions[nonce] = {
        to: transaction.to,
        gas: transaction.gas,
        gasPrice: transaction.gasPrice,
        data: transaction.data,
        value: transaction.value,
        transactionHash: transactionHash
      };
    });
    sentTx.on("receipt", receipt => {
      delete this.pendingTransactions.nonce;
    });
  }
}

module.exports = EthAccount;

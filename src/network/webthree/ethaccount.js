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

  async _getNonceFor(transaction) {
    for (nonce in this.pendingTransactions) {
      const pendingTx = this.pendingTransactions[nonce];
      if (
        transaction.to === pendingTx.to &&
        transaction.data === pendingTx.data
      )
        return nonce;
    }

    return (
      (await EthAccount.getHighestConfirmedNonce()) +
      Object.keys(this.pendingTransactions).length
    );
  }

  signAndSend(transaction, nonce = null) {
    const self = EthAccount.shared;
    if (nonce === null) {
      self._getNonceFor(transaction).then(n => self.signAndSend(transaction, n));
      return;
    }

    transaction.from = process.env.ACCOUNT_PUBLIC_KEY;
    transaction.nonce = web3.utils.toHex(nonce);

    if (nonce in self.pendingTransactions) {
      const currentGasPrice = self.pendingTransactions[nonce].gasPrice;
      if (transaction.gasPrice <= currentGasPrice) {
        console.error("Failed to override transaction. Gas price too low.");
        return;
      }
      console.warn("Overriding transaction with nonce ${nonce}.");
    }

    const sentTx = EthAccount._send(EthAccount._sign(transaction));
    sentTx.on("sent", payload => {
      self.pendingTransactions[nonce] = {
        to: transaction.to,
        gas: transaction.gas,
        gasPrice: transaction.gasPrice,
        data: transaction.data,
        value: transaction.value
      };
    });
    sentTx.on("transactionHash", transactionHash => {
      self.pendingTransactions[nonce] = {
        to: transaction.to,
        gas: transaction.gas,
        gasPrice: transaction.gasPrice,
        data: transaction.data,
        value: transaction.value,
        transactionHash: transactionHash
      };
    });
    sentTx.on("receipt", receipt => {
      console.log(`Got receipt for transaction ${nonce}`);
      delete self.pendingTransactions.nonce;
    });
    sentTx.on("error", error => {
      console.error(`Got error for transaction ${nonce}`);
      delete self.pendingTransactions.nonce;
    });

    return sentTx;
  }
}

module.exports = EthAccount;

const Web3 = require('web3');
const Tx = require('ethereumjs-tx').Transaction;

// TODO does this code get run once, or on every import/require
//global.web3 = new Web3(process.env.WEB3_ENDPOINT);
net = require('net');
global.web3 = new Web3('/media/haydenshively/SamsungT5/Geth/geth.ipc', net);

// const account = web3.eth.accounts.privateKeyToAccount('0x'+process.env.PRIVATE_KEY);
// web3.eth.accounts.wallet.add(account);
// web3.eth.defaultAccount = account.address;

class Contract {
  constructor(address, abi) {
    this.address = address;
    this.abi = abi;
    this.contract = new web3.eth.Contract(this.abi, this.address);

    this.localNonce = null;
  }

  async setNonce() {
    this.localNonce = await web3.eth.getTransactionCount(process.env.PUBLIC_KEY);
  }

  async txFor(encodedMethod, wallet, gasLimit, gasPrice) {
    if (this.localNonce === null) await this.setNonce();
    const nonce = this.localNonce;
    this.localNonce++;
    return {
      nonce: web3.utils.toHex(nonce),
      from: wallet,
      to: this.address,
      gas: web3.utils.toHex(gasLimit),
      gasPrice: web3.utils.toHex(gasPrice),
      data: encodedMethod,
    };
  }

  async txWithValueFor(encodedMethod, wallet, gasLimit, gasPrice, value) {
    if (this.localNonce === null) await this.setNonce();
    const nonce = this.localNonce;
    this.localNonce++;
    return {
      nonce: web3.utils.toHex(nonce),
      from: wallet,
      to: this.address,
      gas: web3.utils.toHex(gasLimit),
      gasPrice: web3.utils.toHex(gasPrice),
      data: encodedMethod,
      value: value,
    };
  }

  sign(transaction) {
    const tx = new Tx(transaction);// Could add chain/hardfork specifics here
    tx.sign(Buffer.from(process.env.PRIVATE_KEY, 'hex'));
    return '0x' + tx.serialize().toString('hex');
  }

  send(signedTx, methodTag) {
    const sentTx = web3.eth.sendSignedTransaction(signedTx);
    sentTx.on('receipt', (receipt) => {
      console.log('Log @' + methodTag + ' - Received receipt');
      console.log(receipt);
    });
    sentTx.on('error', (error) => {
      console.log('Error @' + methodTag + ' - Received error - ' + error.toString());
    });
  }
}

module.exports = Contract;

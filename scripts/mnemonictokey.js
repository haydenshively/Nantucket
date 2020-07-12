const ethers = require("ethers");

const mnemonic = "YOUR 24 WORD MNEMONIC";
const path = "wallet/path'/0";

const mnemonicWallet = ethers.Wallet.fromMnemonic(mnemonic, path);
console.log(mnemonicWallet.privateKey);

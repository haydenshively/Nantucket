require('dotenv').config();

const HDWalletProvider = require("@truffle/hdwallet-provider");

module.exports = {
  networks: {
    development: {
      protocol: 'http',
      host: 'localhost',
      port: 8545,
      gas: 5000000,
      gasPrice: 5e9,
      networkId: '*',
    },
    production: {
      provider: () => new HDWalletProvider(process.env.MNEMONIC, 'https://mainnet.infura.io/v3/' + process.env.INFURA_ID),
      gas: 5000000,
      gasPrice: 35e9,
      networkId: '*',
    },
  },
};

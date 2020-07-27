require("dotenv").config();

const HDWalletProvider = require("@truffle/hdwallet-provider");

module.exports = {
  networks: {
    development: {
      provider: () =>
        new HDWalletProvider(
          "glad famous milk doctor wedding rifle piece rival fancy youth boost frame",
          "https://kovan.infura.io/v3/" + process.env.INFURA_ID
        ),
      gas: 5000000,
      gasPrice: 30e9,
      networkId: "*"
    },
    production: {
      provider: () =>
        new HDWalletProvider(
          process.env.MNEMONIC,
          "https://mainnet.infura.io/v3/" + process.env.INFURA_ID
        ),
      gas: 4000000,
      gasPrice: 56e9,
      networkId: "*"
    }
  }
};

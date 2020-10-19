require("dotenv").config();

global.inCI = process.env.CI;

const { Pool } = require("pg");
global.pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// configure web3
global.web3 = {};
const {
  MultiSendProvider,
  ProviderFor
} = require("../src/network/webthree/providers");
const infura = {
  type: "WS_Infura",
  envKeyID: "PROVIDER_INFURA_ID"
};
const alchemy = {
  type: "WS_Alchemy",
  envKeyKey: "PROVIDER_ALCHEMY_KEY"
};
web3.mainnet = new MultiSendProvider("mainnet", [infura, alchemy]);
web3.ropsten = ProviderFor("ropsten", infura);
// configure ganache
const Web3 = require("web3");
const ganache = require("ganache-cli");
// note that ganache does not currently support replacement transactions
web3.mainnet = new Web3(
  ganache.provider({
    port: 8546,
    fork: web3.mainnet.providers[0],
  })
);

// configure winston
const winston = require("winston");
winston.configure({
  format: winston.format.combine(
    winston.format.splat(),
    winston.format.simple()
  ),
  transports: [new winston.transports.Console({ handleExceptions: true })],
  exitOnError: false
});

after(() => {
  for (let chain in web3) {
    web3[chain].eth.clearSubscriptions();
    if (chain === "ganache") continue;
    try {
      web3[chain].currentProvider.connection.close();
    } catch {
      try {
        web3[chain].currentProvider.connection.destroy();
      } catch {}
    }
  }
  pool.end();
});

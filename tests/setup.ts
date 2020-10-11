require("dotenv").config();

// @ts-ignore
global.inCI = process.env.CI;

const { Pool } = require("pg");
// @ts-ignore
global.pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// configure web3
// @ts-ignore
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
// @ts-ignore
global.web3.mainnet = new MultiSendProvider("mainnet", [infura, alchemy]);
// @ts-ignore
global.web3.ropsten = ProviderFor("ropsten", infura);

// configure winston
const winston = require("winston");
const SlackHook = require("../src/logging/slackhook");
winston.configure({
  format: winston.format.combine(
    winston.format.splat(),
    winston.format.simple()
  ),
  transports: [
    new winston.transports.Console({ handleExceptions: true }),
  ],
  exitOnError: false
});

after(() => {
  // @ts-ignore
  for (let chain in global.web3) {
    // @ts-ignore
    global.web3[chain].eth.clearSubscriptions();
    try {
      // @ts-ignore
      global.web3[chain].currentProvider.connection.close();
    } catch {
      // @ts-ignore
      global.web3[chain].currentProvider.connection.destroy();
    }
  }
  // @ts-ignore
  global.pool.end();
});

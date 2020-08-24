require("dotenv").config();

global.inCI = process.env.CI;

const { Pool } = require("pg");
global.pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// configure web3
global.web3 = {}
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
    new SlackHook({
      level: "info",
      webhookUrl: process.env.SLACK_WEBHOOK,
      mrkdwn: true
    })
  ],
  exitOnError: false
});

after(() => {
  for (let chain in web3) {
    web3[chain].eth.clearSubscriptions();
    try {
      web3[chain].currentProvider.connection.close();
    } catch {
      web3[chain].currentProvider.connection.destroy();
    }
  }
  pool.end();
});

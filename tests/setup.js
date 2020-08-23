require("dotenv").config();
const config = require("../config.test.json");

global.inCI = process.env.CI;

const { Pool } = require("pg");
global.pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

// configure web3
const Web3 = require("web3");
const net = require("net");

global.web3s = {};
for (let key in config.networks) {
  web3s[key] = [];
  for (let spec of config.networks[key].providers) {
    let path;
    switch (spec.type) {
      case "IPC":
        path = process.env[spec.envKeyPath];
        web3s[key].push(new Web3(path, net));
        break;
      case "WS_Infura":
        path = `wss://${key}.infura.io/ws/v3/` + process.env[spec.envKeyID];
        web3s[key].push(new Web3(path));
        break;
      case "WS_Alchemy":
        path =
          `wss://eth-${key}.ws.alchemyapi.io/v2/` + process.env[spec.envKeyKey];
        web3s[key].push(new Web3(path));
        break;
    }
  }
}

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
  for (let net in web3s) {
    for (let provider of web3s[net]) {
      provider.eth.clearSubscriptions();
      try {
        provider.currentProvider.connection.close();
      } catch {
        provider.currentProvider.connection.destroy();
      }
    }
  }
  pool.end();
});

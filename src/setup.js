require("dotenv").config();

// configure web3
const Web3 = require("web3");
const net = require("net");

global.web3s = {};
for (let key in config.networks) {
  web3s[key] = [];
  for (let spec of config.networks[key].providers) {
    switch (spec.type) {
      case "IPC":
        const path = process.env[spec.envKeyPath];
        web3s[key].push(new Web3(path, net));
        break;
      case "WS_Infura":
        const path =
          `wss://${key}.infura.io/ws/v3/` + process.env[spec.envKeyID];
        web3s[key].push(new Web3(path));
        break;
      case "WS_Alchemy":
        const path =
          `wss://eth-${key}.ws.alchemyapi.io/v2/` + process.env[spec.envKeyKey];
        web3s[key].push(new Web3(path));
        break;
      default:
        continue;
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

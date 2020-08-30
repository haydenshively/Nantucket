require("dotenv").config();
const config = require(process.argv[2]);

// configure web3
const { MultiSendProvider } = require("./network/webthree/providers");
global.web3 = new MultiSendProvider(
  config.network.name,
  config.network.providers
);

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

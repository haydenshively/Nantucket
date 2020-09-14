import { config } from "dotenv";

import { MultiSendProvider } from "./network/webthree/providers";
import winston from "winston";
import SlackHook from "../src/logging/slackhook";

// Collect dotenv configuration data
config();

const localconfig = require(process.argv[2]);

// configure web3
export const web3 = new MultiSendProvider(
  localconfig.network.name,
  localconfig.network.providers
);

// configure winston
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

require("dotenv").config();

const cluster = require("cluster");

async function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

// configure web3
const Web3 = require("web3");
if (process.env.WEB3_PROVIDER.endsWith(".ipc")) {
  net = require("net");
  global.web3 = new Web3(process.env.WEB3_PROVIDER, net);
} else {
  global.web3 = new Web3(process.env.WEB3_PROVIDER);
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

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  const TxManager = require("./network/webthree/txmanager");

  // configure TxManagers
  const txManagerA = new TxManager(
    "ACCOUNT_PUBLIC_KEY_A",
    "ACCOUNT_PRIVATE_KEY_A",
    5
  );
  const txManagerB = new TxManager(
    "ACCOUNT_PUBLIC_KEY_B",
    "ACCOUNT_PRIVATE_KEY_B",
    5
  );

  const numCPUs = require("os").cpus().length;
  if (numCPUs < 4) {
    console.error("Nantucket requires at least 3 CPU cores");
    process.exit();
  }

  let workers = [];
  // worker #1 just pulls data from AccountService and cTokenService
  workers.push(cluster.fork());
  // worker #2 watches high-value accounts
  workers.push(cluster.fork());
  workers[1].on("message", msg => {
    txManagerA.insert(msg.tx, msg.priority, 60000, true, msg.key);
  });
  // worker #3 watches mid-range accounts
  workers.push(cluster.fork());
  workers[2].on("message", msg => {
    txManagerB.insert(msg.tx, msg.priority, 60000, true, msg.key);
  });

  txManagerA.init().then(() => {
    txManagerB.init().then(() => {
      workers[0].send({
        desiredType: "web",
        args: [0, 0, 0, 0, 0, 0, 0]
      });
      workers[1].send({
        desiredType: "webthree",
        args: [1.2, 5.0, 1.5, 10, 40.0, 110, 0]
      });
      workers[2].send({
        desiredType: "webthree",
        args: [1.5, 4.0, 5.0, 10, 14.0, 110, 15]
      });
    });
  });

  process.on("SIGINT", () => {
    console.log("\nCaught interrupt signal");
    workers.forEach(worker => worker.kill("SIGINT"));
    process.exit();
  });
}

if (cluster.isWorker) {
  console.log(`Worker ${process.pid} is running`);
  const Tokens = require("./network/webthree/compound/ctoken");

  // prepare main functionality
  const Main = require("./main");
  let main = null;

  // allow messages from master to configure behavior
  process.on("message", async msg => {
    if (main !== null) {
      console.warn(`Worker ${process.pid} is already configured`);
      return;
    }

    const args = msg.args;
    main = new Main(args[0], args[1], args[2], args[3], args[4], args[5]);
    if (args[6] > 0) await sleep(args[6] * 1000);

    switch (msg.desiredType) {
      case "web":
        // update database using cTokenService and AccountService
        setInterval(main.pullFromCTokenService.bind(main), 6 * 60 * 1000);
        setInterval(main.pullFromAccountService.bind(main), 9 * 60 * 1000);
        break;

      case "webthree":
        // populate liquidation candidate list immediately
        main.updateLiquidationCandidates.bind(main)();
        // also schedule it to run repeatedly
        setInterval(main.updateLiquidationCandidates.bind(main), 5 * 60 * 1000);
        // check on candidates every block
        web3.eth.subscribe("newBlockHeaders", (err, block) => {
          if (err) {
            winston.log("error", "🚨 *Block Headers* | " + String(err));
            return;
          }

          if (Number(block.number) % 240 === 0) winston.log("info", `☑️ *Block Headers* | ${block.number}`);
          main.onNewBlock.bind(main)(block.number);
        });
        // log losses for debugging purposes
        for (let symbol in Tokens.mainnet) {
          const token = Tokens.mainnet[symbol];
          token.subscribeToLogEvent("LiquidateBorrow", (err, event) => {
            if (err) {
              winston.log("error", "🚨 *Liquidate Event* | " + String(err));
              return;
            }

            main.onNewLiquidation.bind(main)(event);
          });
        }
        break;
    }
  });

  // before exiting, clean up any connections in main
  process.on("SIGINT", code => {
    web3.eth.clearSubscriptions();
    if (main !== null) main.stop();

    console.log(`Worker ${process.pid} has exited cleanly`);
    process.exit();
  });
}

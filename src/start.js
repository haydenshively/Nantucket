require("dotenv").config();
require("./setup");

const cluster = require("cluster");
const winston = require("winston");

const Main = require("./main");
const Oracle = require("./network/webthree/compound/oraclev1");
const Tokens = require("./network/webthree/compound/ctoken");
const TxManager = require("./network/webthree/txmanager");

const config = require("./config.json");

async function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // configure TxManagers
  let txManagers = config.txManagers;
  for (key in txManagers) {
    txManagers[key] = new TxManager(
      txManagers[key].envKeyAddress,
      txManagers[key].envKeySecret,
      txManagers[key].maxInProgressTxs
    );
    // this property isn't there by default
    txManagers[key].liquidators = [];
  }

  const numCPUs = require("os").cpus().length;
  if (numCPUs < config.liquidators.length + 1) {
    console.error("Nantucket requires more CPU cores for this config");
    process.exit();
  }

  let workers = [];
  // worker 0 just pulls data from AccountService and cTokenService
  workers.push(cluster.fork());
  workers[0].send({
    desiredType: "web",
    args: [0, 0, 0, 0, 0, 0]
  });
  // other workers watch accounts and liquidate
  let i = 1;
  for (let liquidator of config.liquidators) {
    workers.push(cluster.fork());
    workers[i].on("message", msg => {
      const replaced = txManagers[liquidator.txManager].increaseGasPriceFor(
        msg.key,
        msg.tx.gasPrice
      );
      if (replaced) return;
      txManagers[liquidator.txManager].insert(
        msg.tx,
        msg.priority,
        config.txTimeoutMS,
        true,
        msg.key
      );
    });
    txManagers[liquidator.txManager].liquidators.push(i - 1);
    i++;
  }

  const onTxManagerInits = config.liquidators.map((liquidator, i) => {
    return () => {
      workers[i + 1].send({
        desiredType: "webthree",
        args: [
          liquidator.gasPriceMultiplier,
          liquidator.minRevenue,
          liquidator.maxRevenue,
          liquidator.maxHealth,
          liquidator.numCandidates,
          i * 15
        ]
      });
    };
  });

  for (key in txManagers) {
    const txManager = txManagers[key];
    txManager.init().then(() => {
      for (let i of txManager.liquidators) onTxManagerInits[i]();
    });
  }

  web3.eth.subscribe("newBlockHeaders", (err, block) => {
    if (err) {
      winston.log("error", "🚨 *Block Headers* | " + String(err));
      return;
    }
    if (block.number % 240 === 0)
      winston.log("info", `☑️ *Block Headers* | ${block.number}`);
  });

  process.on("SIGINT", () => {
    console.log("\nCaught interrupt signal");
    workers.forEach(worker => worker.kill("SIGINT"));
    process.exit();
  });
}

if (cluster.isWorker) {
  console.log(`Worker ${process.pid} is running`);

  let main = null;

  // allow messages from master to configure behavior
  process.on("message", async msg => {
    if (main !== null) {
      console.warn(`Worker ${process.pid} is already configured`);
      return;
    }

    const args = msg.args;
    main = new Main(args[0], args[1], args[2], args[3], args[4]);
    if (args[5] > 0) await sleep(args[5] * 1000);

    switch (msg.desiredType) {
      case "web":
        // update database using cTokenService and AccountService
        setInterval(main.pullFromCTokenService.bind(main), 6 * 60 * 1000);
        setInterval(main.pullFromAccountService.bind(main), 9 * 60 * 1000);
        break;

      case "webthree":
        // populate liquidation candidate list immediately
        main.updateCandidates.bind(main)();
        // also schedule it to run repeatedly
        setInterval(main.updateCandidates.bind(main), 5 * 60 * 1000);
        // check on candidates every block
        web3.eth.subscribe("newBlockHeaders", (err, block) => {
          if (err) return;

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

        Oracle.mainnet
          .onNewPendingEvent("PricePosted")
          .on("data", async event => {
            tx = await web3.eth.getTransaction(event.transactionHash);
            main.onNewPricesOnChain.bind(main)(tx);
          });
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

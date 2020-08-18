require("./setup");

if (process.argv.length < 6) {
  console.log("Worker process requires 4 arguments");
  process.exit();
}
console.log(`Worker ${process.pid} is running`);

const Worker = require("./worker");
const worker = new Worker(
  Number(process.argv[2]),
  process.argv[3] == "null" ? null : Number(process.argv[3]),
  process.argv[4] == "null" ? null : Number(process.argv[4]),
  Number(process.argv[5])
);

process.on("SIGINT", code => {
  web3.eth.clearSubscriptions();
  worker.stop();

  console.log(`Worker ${process.pid} has exited cleanly`);
  process.exit();
});

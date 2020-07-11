require("dotenv").config();

const { Pool } = require("pg");

const Web3 = require("web3");
if (process.env.WEB3_PROVIDER_TEST.endsWith(".ipc")) {
  net = require("net");
  global.web3 = new Web3(process.env.WEB3_PROVIDER_TEST, net);
} else {
  global.web3 = new Web3(process.env.WEB3_PROVIDER_TEST);
}

// src.database
const TableUTokens = require("./database/tableutokens");
const TableCTokens = require("./database/tablectokens");
const TablePaySeizePairs = require("./database/tablepayseizepairs");
const TableUsers = require("./database/tableusers");
// src.network.web
const AccountService = require("./network/web/compound/accountservice");
const CTokenService = require("./network/web/compound/ctokenservice");
const GasPrice = require("./network/web/gasstation/gasprice");
// src.network.webthree
const EthAccount = require("./network/webthree/ethaccount");
const Comptroller = require("./network/webthree/compound/comptroller");
const Tokens = require("./network/webthree/compound/ctoken");

new EthAccount();

class Main {
  constructor(manualLiquidationTargets) {
    // Database is assumed to have already been setup & initialized
    this._pool = new Pool({
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    this._tableUTokens = new TableUTokens(this._pool);
    this._tableCTokens = new TableCTokens(this._pool, this._tableUTokens);
    this._tablePaySeizePairs = new TablePaySeizePairs(
      this._pool,
      this._tableCTokens
    );
    this._tableUsers = new TableUsers(
      this._pool,
      this._tableCTokens,
      this._tablePaySeizePairs
    );

    this._accountService = new AccountService();
    this._ctokenService = new CTokenService();
    this._gasPriceAPI = new GasPrice();

    this._blockLastAccountServicePull = null;
    this._blocksPerMinute = 0;

    this._liquidationTargets = [];
    this.manualLiquidationTargets = manualLiquidationTargets;
  }

  async pullFromCTokenService() {
    const tokens = (await ctokenService.fetch({})).tokens;
    await this._tableUTokens.upsertCTokenService(tokens);
    await this._tableCTokens.upsertCTokenService(tokens);
    await this._tablePaySeizePairs.insertCTokenService(tokens);
  }

  async pullFromAccountService(timeout_minutes, offset_minutes) {
    const blockCurrent = await web3.eth.getBlockNumber();
    const blockToLabel = blockCurrent - offset_minutes * this._blocksPerMinute;
    const closeFactor = await Comptroller.mainnet.closeFactor();
    const liquidationIncentive = await Comptroller.mainnet.liquidationIncentive();

    // 0 means pull most recent block
    // We label it with an older block number to avoid overwriting fresher
    // data from on-chain calls
    this._accountService.fetchAll(0, accounts => {
      this._tableUsers.upsertAccountService(
        blockToLabel,
        accounts,
        closeFactor,
        liquidationIncentive
      );
    });

    if (this._blockLastAccountServicePull !== null) {
      this._blocksPerMinute =
        (blockCurrent - this._blockLastAccountServicePull) / timeout_minutes;
    }
    this._blockLastAccountServicePull = blockCurrent;
  }

  async updateLiquidationCandidates(
    lowCount = 10,
    highCount = 90,
    highThresh_Eth = 50
  ) {
    const estimatedTxFee_Eth =
      ((await web3.eth.getGasPrice()) / 1e18) * 1000000;
    this._liquidationTargets = this.manualLiquidationTargets
      .concat(
        await this._tableUsers.getLiquidationLowCandidates(
          lowCount,
          estimatedTxFee_Eth
        )
      )
      .concat(
        await this._tableUsers.getLiquidationHighCandidates(
          highCount,
          highThresh_Eth
        )
      );
  }

  async onNewBlock() {
    const gasPrice = await web3.eth.getGasPrice();
    for (let target of this._liquidationTargets) {
      const userAddr = "0x" + target.address;
      Comptroller.mainnet.accountLiquidityOf(userAddr).then(async res => {
        if (res[1] > 0.0) {
          // Target has negative liquidity. We're good to go
          const repayAddr =
            "0x" + (await this._tableCTokens.getAddress(target.ctokenidpay));
          const seizeAddr =
            "0x" + (await this._tableCTokens.getAddress(target.ctokenidseize));

          const closeFact = await Comptroller.mainnet.closeFactor();
          const repayAmnt =
            closeFact *
            1e18 *
            (await Tokens.mainnetByAddr[repayAddr].uUnitsInContractFor(
              userAddr
            ));
          
          console.log("Liquidating " + userAddr);
          const tx = Tokens.mainnetByAddr[repayAddr].flashLiquidate_uUnits(
            userAddr,
            repayAmnt,
            seizeAddr,
            gasPrice
          );

          EthAccount.shared.signAndSend(tx, await EthAccount.getHighestConfirmedNonce());
        }
      });
    }
  }
}

const main = new Main([]);

setInterval(main.pullFromCTokenService, 6 * 60 * 1000);
setInterval(main.pullFromAccountService, 12 * 60 * 1000, 12, 4);
setInterval(main.updateLiquidationCandidates, 5 * 60 * 1000);

web3.eth.subscribe("newBlockHeaders", (err, block) => {
  if (err) {
    console.log(error);
    return;
  }

  console.log(block.number);
  main.onNewBlock();
});

process.on("SIGINT", () => {
  console.log("\nCaught interrupt signal");

  web3.eth.clearSubscriptions();
  main._pool.end();
  process.exit();
});

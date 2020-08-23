const { Pool } = require("pg");

// src.database
const TableUTokens = require("./database/tableutokens");
const TableCTokens = require("./database/tablectokens");
const TablePaySeizePairs = require("./database/tablepayseizepairs");
const TableUsers = require("./database/tableusers");
// src.network.web
const AccountService = require("./network/web/compound/accountservice");
const CTokenService = require("./network/web/compound/ctokenservice");
// src.network.webthree
const Comptroller = require("./network/webthree/compound/comptroller");

class Database {
  constructor() {
    // Prepare to interact with database
    this._pool = new Pool({
      max: 30,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    // Prepare to interact with database tables
    this._tUTokens = new TableUTokens(this._pool);
    this._tCTokens = new TableCTokens(this._pool, this._tUTokens);
    this._tPairs = new TablePaySeizePairs(this._pool, this._tCTokens);
    this._tUsers = new TableUsers(this._pool, this._tCTokens, this._tPairs);

    // Prepare to interact with web 2.0 APIs
    this._accountService = new AccountService();
    this._ctokenService = new CTokenService();
  }

  async pullFromCTokenService() {
    const res = await this._ctokenService.fetch({});
    if (res.error) {
      console.warn("Fetch cTokenService failed: " + res.error.toString());
      return;
    }

    const tokens = res.tokens;
    await this._tUTokens.upsertCTokenService(tokens);
    await this._tCTokens.upsertCTokenService(tokens);
    await this._tPairs.insertCTokenService(tokens);
  }

  async pullFromAccountService(web3Idx = 0) {
    // TODO currently this function is only compatible with mainnet, but
    // could be easily extended to work with testnets
    const blockLabel = (await web3s.mainnet[web3Idx].eth.getBlockNumber()) - 20;
    const closeFact = await Comptroller.mainnet[web3Idx].closeFactor();
    const liqIncent = await Comptroller.mainnet[web3Idx].liquidationIncentive();

    // 0 means pull most recent block
    // We label it with an older block number to avoid overwriting fresher
    // data from on-chain calls
    await this._accountService.fetchAll(0, accounts => {
      this._tUsers.upsertAccountService(
        blockLabel,
        accounts,
        closeFact,
        liqIncent
      );
    });
  }

  stop() {
    this._pool.end();
  }
}

module.exports = Database;

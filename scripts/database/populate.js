require("dotenv").config();

const { Pool } = require("pg");

const AccountService = require("../../src/network/web/compound/accountservice");
const accountService = new AccountService();
const CTokenService = require("../../src/network/web/compound/ctokenservice");
const ctokenService = new CTokenService();

const TableUTokens = require("../../src/database/tableutokens");
const TableCTokens = require("../../src/database/tablectokens");
const TablePaySeizePairs = require("../../src/database/tablepayseizepairs");
const TableUsers = require("../../src/database/tableusers");

const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const tableUTokens = new TableUTokens(pool);
const tableCTokens = new TableCTokens(pool, tableUTokens);
const tablePaySeizePairs = new TablePaySeizePairs(pool, tableCTokens);
const tableUsers = new TableUsers(pool, tableCTokens, tablePaySeizePairs);

;(async () => {
  try {
    // const tokens = (await ctokenService.fetch({})).tokens;

    // await tableUTokens.upsertCTokenService(tokens);
    // await tableCTokens.upsertCTokenService(tokens);
    // await tablePaySeizePairs.insertCTokenService(tokens);
    
    const accounts = await accountService.fetchAll(10436262);

    await tableUsers.upsertAccountService(10436262, accounts, 0.5, 1.08);


  } finally {
    pool.end();
  }

})().catch(err => console.log(err.stack))
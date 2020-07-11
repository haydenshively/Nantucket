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
  connectionTimeoutMillis: 2000
});

const tableUTokens = new TableUTokens(pool);
const tableCTokens = new TableCTokens(pool, tableUTokens);
const tablePaySeizePairs = new TablePaySeizePairs(pool, tableCTokens);
const tableUsers = new TableUsers(pool, tableCTokens, tablePaySeizePairs);

/*
NOTES

After initial setup, tables will need to be regularly updated.

utokens:      update whenever price changes (as often as possible, likely every 5 minutes or so)
ctokens:      update whenever collateral factor changes
users:        update whenever prices change, and also whenever somebody supplies/borrows (changes asset status)
payseizepairs:upadte whenever a new asset is added to the protocol

*/

(async () => {
  try {
    const tokens = (await ctokenService.fetch({})).tokens;
    await tableUTokens.upsertCTokenService(tokens);
    await tableCTokens.upsertCTokenService(tokens);
    await tablePaySeizePairs.insertCTokenService(tokens);

    await accountService.fetchAll(0, accounts => {
      tableUsers.upsertAccountService(10436800, accounts, 0.5, 1.08);
    });
  } finally {
    pool.end();
  }
})().catch(err => console.log(err.stack));

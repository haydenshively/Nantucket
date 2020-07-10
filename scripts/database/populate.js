require("dotenv").config();

const { Pool } = require("pg");

const AccountService = require("../../src/network/web/compound/accountservice");
const accountService = new AccountService();
const CTokenService = require("../../src/network/web/compound/ctokenservice");
const ctokenService = new CTokenService();

const pool = new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function serviceFetchAll() {
  let accounts = [];

  let i = 1;
  let pageCount;

  let result;
  do {
    result = await accountService.fetch({ page_number: i, page_size: 200});
    pageCount = result.pagination.total_pages;
    console.log("Fetched page " + String(i) + "/" + String(pageCount));
    i++;

    accounts = accounts.concat(result.accounts);
  } while (i <= pageCount);

  return accounts;
}

;(async () => {
  const client = await pool.connect()

  try {

    let cTokenIDs = {};
    // Download list of all tokens from Compound cToken Service
    const tokens = (await ctokenService.fetch({})).tokens;
    for (token of tokens) {
      // If uToken address isn't already in the UTOKENS table, insert it
      // NOTE: Postgres enforces address uniqueness
      const address = String(token.address()).slice(2);
      const underlyingAddress = (token.underlyingAddress() === null) ? "0000000000000000000000000000000000000000" : String(token.underlyingAddress()).slice(2);
      await client.query(
        `
        INSERT INTO utokens (address, name, symbol, costineth)
        VALUES ($1::text, $2::text, $3::text, $4)
        ON CONFLICT (address) DO UPDATE
        SET name=EXCLUDED.name, symbol=EXCLUDED.symbol, costineth=EXCLUDED.costineth
        `,
        [
          underlyingAddress,
          token.underlyingName(),
          token.underlyingSymbol(),
          Number(token.underlyingPrice()),
        ]
      );
      // Once uToken address has been inserted, it is assigned a unique ID
      // Retrieve that ID here
      const uTokenID = (await client.query(
        "SELECT (id) FROM utokens WHERE address = $1::text",
        [underlyingAddress]
      )).rows[0].id;

      // If cToken address isn't already in the CTOKENS table, insert it
      // NOTE: Postgres enforces address uniqueness
      await client.query(
        `
        INSERT INTO ctokens (address, name, symbol, collateralfactor, exchangerate, borrowrate, supplyrate, utokenid)
        VALUES ($1::text, $2::text, $3::text, $4, $5, $6, $7, $8)
        ON CONFLICT (address) DO UPDATE
        SET name=EXCLUDED.name, symbol=EXCLUDED.symbol, collateralfactor=EXCLUDED.collateralfactor, exchangerate=EXCLUDED.exchangerate, borrowrate=EXCLUDED.borrowrate, supplyrate=EXCLUDED.supplyrate, utokenid=EXCLUDED.utokenid
        `,
        [
          address,
          token.name(),
          token.symbol(),
          Number(token.collateralFactor()),
          Number(token.exchangeRate()),
          Number(token.borrowRate()),
          Number(token.supplyRate()),
          uTokenID,
        ]
      );
      // Once uToken address has been inserted, it is assigned a unique ID
      // Retrieve that ID here
      const cTokenID = (await client.query(
        "SELECT (id) FROM ctokens WHERE address = $1::text",
        [address]
      )).rows[0].id;

      cTokenIDs[address] = cTokenID;
    }

    // Download giant list of all accounts from Compound AccountService
    const accounts = await serviceFetchAll();

    for (account of accounts) {
      // // If account address isn't already in the USERS table, insert it
      // // NOTE: Postgres enforces uniqueness
      // await client.query(
      //   "INSERT INTO users (address) VALUES ($1::text) ON CONFLICT (address) DO NOTHING",
      //   [account.address().slice(2)]
      // );
      // // Once account address has been inserted, it is assigned a unique ID
      // // Retrieve that ID here
      // const userID = (await client.query(
      //   "SELECT (id) FROM users WHERE address = $1::text",
      //   [String(account.address()).slice(2)]
      // )).rows[0].id;

      let supply = 0;
      let borrow = 0;

      for (token of account.tokens) {
        const cTokenID = cTokenIDs[String(token.address()).slice(2)];
        const [collat, costineth] = (await client.query(
          "SELECT (collat, costineth) FROM ctokunderlying WHERE id = $1",
          [cTokenID]
        )).rows[0].row.slice(1, -1).split(",");

        supply += Number(token.supplyBalanceUnderlying()) * costineth * collat;
        borrow += Number(token.borrowBalanceUnderlying()) * costineth;

        // if (Number(token.borrowBalanceUnderlying()) > 0) {
        //   await client.query(
        //     `
        //     INSERT INTO credit (userid, ctokenid, amountunderlying)
        //     VALUES ($1, $2, $3)
        //     ON CONFLICT (userid, ctokenid) DO UPDATE
        //     SET amountunderlying=EXCLUDED.amountunderlying
        //     `,
        //     [
        //       userID,
        //       cTokenID,
        //       -Number(token.borrowBalanceUnderlying()),
        //     ]
        //   );
        // }
        // if (Number(token.supplyBalanceUnderlying()) > 0) {
        //   await client.query(
        //     `
        //     INSERT INTO credit (userid, ctokenid, amountunderlying)
        //     VALUES ($1, $2, $3)
        //     ON CONFLICT (userid, ctokenid) DO UPDATE
        //     SET amountunderlying=EXCLUDED.amountunderlying
        //     `,
        //     [
        //       userID,
        //       cTokenID,
        //       +Number(token.supplyBalanceUnderlying()),
        //     ]
        //   );
        // }
      }

      // liquidity = (supply_balances .* collateral_factors) .- borrow_balances
      // (in Eth)
      const liquidity = supply - borrow;

      await client.query(
        "INSERT INTO users (address, liquidity, ts) VALUES ($1::text, $2, $3) ON CONFLICT (address) DO UPDATE SET liquidity=EXCLUDED.liquidity, ts=EXCLUDED.ts",
        [account.address().slice(2), liquidity, "now"]
      );
    }

  } finally {
    client.release();
    pool.end();
  }

})().catch(err => console.log(err.stack))
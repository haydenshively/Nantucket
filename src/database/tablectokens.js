class TableCTokens {
  constructor(pool, tableUTokens) {
    this._pool = pool;
    this._tableUTokens = tableUTokens
  }

  async upsertCTokenService(tokens) {
    for (let token of tokens) {
      const address = String(token.address()).slice(2);
      const addressUnderlying = (token.underlyingAddress() === null) ? "0000000000000000000000000000000000000000" : String(token.underlyingAddress()).slice(2);
      const uTokenID = await this._tableUTokens.getID(addressUnderlying);

      await this.upsert(
        address,
        token.name(),
        token.symbol(),
        Number(token.collateralFactor()),
        Number(token.exchangeRate()),
        Number(token.borrowRate()),
        Number(token.supplyRate()),
        uTokenID
      );
    }
  }

  async upsert(address, name, symbol, collateralFactor, exchangeRate, borrowRate, supplyRate, uTokenID) {
    return this._pool.query(
      `
      INSERT INTO ctokens (address, name, symbol, collateralfactor, exchangerate, borrowrate, supplyrate, utokenid)
      VALUES ($1::text, $2::text, $3::text, $4, $5, $6, $7, $8)
      ON CONFLICT (address) DO UPDATE
      SET name=EXCLUDED.name, symbol=EXCLUDED.symbol, collateralfactor=EXCLUDED.collateralfactor, exchangerate=EXCLUDED.exchangerate, borrowrate=EXCLUDED.borrowrate, supplyrate=EXCLUDED.supplyrate, utokenid=EXCLUDED.utokenid
      `,
      [ address, name, symbol, collateralFactor, exchangeRate, borrowRate, supplyRate, uTokenID ]
    );
  }

  async getID(address) {
    return (await this._pool.query(
      "SELECT id FROM ctokens WHERE address = $1::text",
      [address]
    )).rows[0].id;
  }
}

module.exports = TableCTokens;

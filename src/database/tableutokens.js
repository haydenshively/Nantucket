class TableUTokens {
  constructor(pool) {
    this._pool = pool;
  }

  async upsertCTokenService(tokens) {
    for (let token of tokens) {
      const address =
        token.underlyingAddress() === null
          ? "0000000000000000000000000000000000000000"
          : String(token.underlyingAddress()).slice(2);

      await this.upsert(
        address,
        token.underlyingName(),
        token.underlyingSymbol(),
        Number(token.underlyingPrice())
      );
    }
  }

  async upsert(address, name, symbol, costInEth) {
    return this._pool.query(
      `
      INSERT INTO utokens (address, name, symbol, costineth)
      VALUES ($1::text, $2::text, $3::text, $4)
      ON CONFLICT (address) DO UPDATE
      SET name=EXCLUDED.name, symbol=EXCLUDED.symbol, costineth=EXCLUDED.costineth
      `,
      [address, name, symbol, costInEth]
    );
  }

  async getID(address) {
    return (
      await this._pool.query(
        "SELECT id FROM utokens WHERE address = $1::text",
        [address]
      )
    ).rows[0].id;
  }
}

module.exports = TableUTokens;

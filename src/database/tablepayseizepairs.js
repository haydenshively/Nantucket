class TablePaySeizePairs {
  constructor(pool, tableCTokens) {
    this._pool = pool;
    this._tableCTokens = tableCTokens;
  }

  async insertCTokenService(tokens) {
    let cTokenIDs = [];

    for (let token of tokens) {
      const address = String(token.address()).slice(2);
      cTokenIDs.push(await this._tableCTokens.getID(address));
    }

    for (let payID of cTokenIDs) {
      for (let seizeID of cTokenIDs) {
        if (payID === seizeID) continue;
        await this.insert(payID, seizeID);
      }
    }
  }

  async insert(payID, seizeID) {
    return this._pool.query(
      `
      INSERT INTO payseizepairs (ctokenidpay, ctokenidseize)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [ payID, seizeID ]
    );
  }

  async getID(idPay, idSeize) {
    return (await this._pool.query(
      `
      SELECT id FROM payseizepairs
      WHERE (ctokenidpay=$1 AND ctokenidseize=$2)
      `,
      [idPay, idSeize]
    )).rows[0].id;
  }

  async getPair(id) {
    return (await this._pool.query(
      `
      SELECT ctokenidpay, ctokenidseize FROM payseizepairs
      WHERE id=$1
      `,
      [id]
    )).rows[0];
  }
}

module.exports = TablePaySeizePairs;

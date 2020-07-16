class TableUsers {
  constructor(pool, tableCTokens, tablePaySeizePairs) {
    this._pool = pool;
    this._tableCTokens = tableCTokens;
    this._tablePaySeizePairs = tablePaySeizePairs;
  }

  /*
  NOTES

  Though this has yet to be tested as a strategy, it will likely be good to use on-chain calls to check
  whether users in `getLiquidationLowCandidates()` and `getLiquidationHighCandidates()` are liquidateable
  upon (1) new blocks (to account for price changes) and/or (2) supply/borrow events.

  These user lists can be used in combination with a hard-coded list of highly-profitable liquidation targets.
  
  */

  async getLiquidationCandidates(count = 100, min_Eth = 100) {
    return (
      await this._pool.query(
        `
        SELECT usersnonzero.id, usersnonzero.address, usersnonzero.profitability, payseizepairs.ctokenidpay, payseizepairs.ctokenidseize
        FROM usersnonzero INNER JOIN payseizepairs ON (usersnonzero.pairid=payseizepairs.id)
        WHERE usersnonzero.profitability>$1
        ORDER BY usersnonzero.liquidity ASC
        LIMIT $2
        `,
        [min_Eth, count]
      )
    ).rows;
  }

  async upsertAccountService(
    blockNo,
    accounts,
    closeFactor,
    liquidationIncentive
  ) {
    for (let account of accounts) {
      let supply = 0.0;
      let borrow = 0.0;
      let bestAssetToClose = null;
      let bestAssetToSeize = null;
      let closableMax_Eth = 0.0;
      let seizableMax_Eth = 0.0;

      for (let token of account.tokens) {
        const borrow_uUnits = Number(token.borrowBalanceUnderlying());
        const supply_uUnits = Number(token.supplyBalanceUnderlying());

        if (borrow_uUnits == 0.0 && supply_uUnits == 0.0) continue;

        const cTokenID = await this._tableCTokens.getID(
          token.address().slice(2)
        );
        const { collat, costineth } = await this.getCollatAndCost(cTokenID);

        borrow += borrow_uUnits * costineth * collat;
        supply += supply_uUnits * costineth;

        const closableAmount_Eth = borrow_uUnits * costineth * closeFactor;
        const seizableAmount_Eth =
          (supply_uUnits * costineth) / liquidationIncentive;

        if (
          closableAmount_Eth > closableMax_Eth &&
          seizableAmount_Eth > seizableMax_Eth
        ) {
          if (closableAmount_Eth <= seizableMax_Eth) {
            // In this case, raising closableMax_Eth actually increases rewards
            // (seizableMax_Eth is sufficient to maximize liquidation incentive)
            closableMax_Eth = closableAmount_Eth;
            bestAssetToClose = cTokenID;
          } else {
            // In this case, raising closableMax_Eth wouldn't lead to increased rewards
            // so we increase seizableMax_Eth instead
            seizableMax_Eth = seizableAmount_Eth;
            bestAssetToSeize = cTokenID;
          }
        } else if (closableAmount_Eth > closableMax_Eth) {
          closableMax_Eth = closableAmount_Eth;
          bestAssetToClose = cTokenID;
        } else if (seizableAmount_Eth > seizableMax_Eth) {
          seizableMax_Eth = seizableAmount_Eth;
          bestAssetToSeize = cTokenID;
        }
      }

      // const liquidity = supply - borrow;
      let liquidity = supply / borrow;// really "health"
      if (!isFinite(liquidity)) liquidity = 1000;
      const profitability =
        Math.min(closableMax_Eth, seizableMax_Eth) *
        (liquidationIncentive - 1.0);

      let pairID;
      if (bestAssetToClose === null || bestAssetToSeize === null) {
        pairID = null;
      } else {
        pairID = await this._tablePaySeizePairs.getID(
          bestAssetToClose,
          bestAssetToSeize
        );
      }

      await this.upsert(
        account.address().slice(2),
        liquidity,
        profitability,
        pairID,
        blockNo
      );
    }
  }

  async upsert(address, liquidity, profitability, pairID, blockUpdated) {
    return this._pool.query(
      `
      INSERT INTO users (address, liquidity, profitability, pairid, blockupdated)
      VALUES ($1::text, $2, $3, $4, $5)
      ON CONFLICT (address) DO UPDATE
      SET liquidity=EXCLUDED.liquidity, profitability=EXCLUDED.profitability, pairid=EXCLUDED.pairid, blockupdated=EXCLUDED.blockupdated
      WHERE EXCLUDED.blockUpdated>=users.blockUpdated
      `,
      [address, liquidity, profitability, pairID, blockUpdated]
    );
  }

  async getCollatAndCost(cTokenID) {
    return (
      await this._pool.query(
        "SELECT collat, costineth FROM ctokunderlying WHERE id = $1",
        [cTokenID]
      )
    ).rows[0];
  }
}

module.exports = TableUsers;

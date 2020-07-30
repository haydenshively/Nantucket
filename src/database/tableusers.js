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

  async getLiquidationCandidates(
    count = 100,
    min_Eth = 1,
    max_Eth = null,
    maxHealth = null
  ) {
    return (
      await this._pool.query(
        `
        SELECT usersnonzero.id, usersnonzero.address, usersnonzero.profitability, payseizepairs.ctokenidpay, payseizepairs.ctokenidseize
        FROM usersnonzero INNER JOIN payseizepairs ON (usersnonzero.pairid=payseizepairs.id)
        WHERE usersnonzero.profitability>=$1
          ${(max_Eth === null) ? "" : `AND usersnonzero.profitability<${max_Eth}`}
          ${(maxHealth === null) ? "" : `AND usersnonzero.liquidity<${maxHealth}`}
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
      let bestAssetToClose = [null, null];
      let bestAssetToSeize = [null, null];
      let closableMax_Eth = [0.0, 0.0];
      let seizableMax_Eth = [0.0, 0.0];

      for (let token of account.tokens) {
        const borrow_uUnits = Number(token.borrowBalanceUnderlying());
        const supply_uUnits = Number(token.supplyBalanceUnderlying());

        if (borrow_uUnits == 0.0 && supply_uUnits == 0.0) continue;

        const cTokenID = await this._tableCTokens.getID(
          token.address().slice(2)
        );
        const { collat, costineth } = await this.getCollatAndCost(cTokenID);

        borrow += borrow_uUnits * costineth;
        supply += supply_uUnits * costineth * collat;

        const closableAmount_Eth = borrow_uUnits * costineth * closeFactor;
        const seizableAmount_Eth =
          (supply_uUnits * costineth) / liquidationIncentive;

        if (closableMax_Eth[0] < closableAmount_Eth) {
          closableMax_Eth = [closableAmount_Eth, closableMax_Eth[0]];
          bestAssetToClose = [cTokenID, bestAssetToClose[0]];
        } else if (closableMax_Eth[1] < closableAmount_Eth) {
          closableMax_Eth[1] = closableAmount_Eth;
          bestAssetToClose[1] = cTokenID;
        }

        if (seizableMax_Eth[0] < seizableAmount_Eth) {
          seizableMax_Eth = [seizableAmount_Eth, seizableMax_Eth[0]];
          bestAssetToSeize = [cTokenID, bestAssetToSeize[0]];
        } else if (seizableMax_Eth[1] < seizableAmount_Eth) {
          seizableMax_Eth[1] = seizableAmount_Eth;
          bestAssetToSeize[1] = cTokenID;
        }
      }

      const isV2Token =
        bestAssetToClose[0] !== bestAssetToSeize[0] ||
        ["6", "9"].includes(String(bestAssetToClose[0]));

      let pairID = null;
      let profitability = 0;

      if (bestAssetToClose[0] !== null && bestAssetToSeize[0] !== null) {
        const closeIdx = Number(
          !isV2Token && bestAssetToClose[1] > bestAssetToSeize[1]
        );
        const seizeIdx = Number(isV2Token ? false : !closeIdx);

        bestAssetToClose = bestAssetToClose[closeIdx];
        bestAssetToSeize = bestAssetToSeize[seizeIdx];
        closableMax_Eth = closableMax_Eth[closeIdx];
        seizableMax_Eth = seizableMax_Eth[seizeIdx];

        // if (isV2Token) {
        //   // V2 tokens allow for repaying/seizing the same asset
        //   bestAssetToClose = bestAssetToClose[0];
        //   bestAssetToSeize = bestAssetToSeize[0];
        //   closableMax_Eth = closableMax_Eth[0];
        //   seizableMax_Eth = seizableMax_Eth[0];
        // } else {
        //   // V1 tokens don't
        //   if (bestAssetToClose[1] > bestAssetToSeize[1]) {
        //     bestAssetToClose = bestAssetToClose[1];
        //     bestAssetToSeize = bestAssetToSeize[0];
        //     closableMax_Eth = closableMax_Eth[1];
        //     seizableMax_Eth = closableMax_Eth[0];
        //   } else {
        //     bestAssetToClose = bestAssetToClose[0];
        //     bestAssetToSeize = bestAssetToSeize[1];
        //     closableMax_Eth = closableMax_Eth[0];
        //     seizableMax_Eth = closableMax_Eth[1];
        //   }
        // }

        pairID = await this._tablePaySeizePairs.getID(
          bestAssetToClose,
          bestAssetToSeize
        );
        profitability =
          Math.min(closableMax_Eth, seizableMax_Eth) *
          (liquidationIncentive - 1.0);
      }

      // const liquidity = supply - borrow;
      let liquidity = supply / borrow; // really "health"
      if (!isFinite(liquidity)) liquidity = 1000;
      if (liquidity > 1000) liquidity = 1000;

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

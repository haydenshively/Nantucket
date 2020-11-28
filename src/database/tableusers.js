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
          ${max_Eth === null ? "" : `AND usersnonzero.profitability<${max_Eth}`}
          ${maxHealth === null ? "" : `AND usersnonzero.liquidity<${maxHealth}`}
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
    closeFactor = Number(closeFactor);
    liquidationIncentive = Number(liquidationIncentive);
    if (closeFactor > 1.0 || liquidationIncentive > 2.0) {
      console.error(
        "Problem upserting from Account Service: close factor or liquidation incentive too high"
      );
      return;
    }

    for (let account of accounts) {
      // Supply and borrow represent the account's *total* collateral
      // and borrow amounts (in Eth)
      let supply = 0.0;
      let borrow = 0.0;
      // top2AssetsTo_____ will contain Token IDs. Idx 0 is the best,
      // and idx 1 is the second best
      let top2AssetsToRepay = [null, null];
      let top2AssetsToSeize = [null, null];
      // top2________Amnts_Eth will contain the amounts (in Eth) correspodning
      // to the top2AssetsTo_____ IDs
      let top2RepayAmnts_Eth = [0.0, 0.0];
      let top2SeizeAmnts_Eth = [0.0, 0.0];

      for (let token of account.tokens) {
        const borrow_uUnits = Number(token.borrowBalanceUnderlying());
        // TODO it's possible that the user is holding CTokens but hasn't
        // actually entered the market, in which case their supply balance
        // shouldn't actually contribute to their collateral computation.
        // Also it wouldn't be seizable
        const supply_uUnits = Number(token.supplyBalanceUnderlying());

        if (borrow_uUnits === 0.0 && supply_uUnits === 0.0) continue;

        const cTokenID = await this._tableCTokens.getID(
          token.address().slice(2)
        );
        const { collat, costineth } = await this.getCollatAndCost(cTokenID);

        borrow += borrow_uUnits * costineth;
        supply += supply_uUnits * costineth * collat;

        const repayAmount_Eth = borrow_uUnits * costineth * closeFactor;
        const seizeAmount_Eth =
          collat > 0.0
            ? (supply_uUnits * costineth) / liquidationIncentive
            : 0.0;

        if (top2RepayAmnts_Eth[0] < repayAmount_Eth) {
          top2RepayAmnts_Eth = [repayAmount_Eth, top2RepayAmnts_Eth[0]];
          top2AssetsToRepay = [cTokenID, top2AssetsToRepay[0]];
        } else if (top2RepayAmnts_Eth[1] < repayAmount_Eth) {
          top2RepayAmnts_Eth[1] = repayAmount_Eth;
          top2AssetsToRepay[1] = cTokenID;
        }

        if (top2SeizeAmnts_Eth[0] < seizeAmount_Eth) {
          top2SeizeAmnts_Eth = [seizeAmount_Eth, top2SeizeAmnts_Eth[0]];
          top2AssetsToSeize = [cTokenID, top2AssetsToSeize[0]];
        } else if (top2SeizeAmnts_Eth[1] < seizeAmount_Eth) {
          top2SeizeAmnts_Eth[1] = seizeAmount_Eth;
          top2AssetsToSeize[1] = cTokenID;
        }
      }

      let pairID = null;
      let profitability = 0;

      if (top2AssetsToRepay[0] !== null && top2AssetsToSeize[0] !== null) {
        // [cDAI, cUSDT, cUNI, cCOMP] are "v2" tokens, meaning they can be both
        // repaid and seized in a single liquidation. Their IDs are 6 and 9
        // respectively. For all other tokens, the repaid type must be different
        // from the seize type. This is why we can't always blindly pick the
        // `topAssetToRepay` and `topAssetToSeize`
        const ableToPickBest =
          top2AssetsToRepay[0] !== top2AssetsToSeize[0] ||
          ["4", "6", "9", "10"].includes(String(top2AssetsToRepay[0]));

        // If `ableToPickBest === true`, then the first clause will be false, and the statement
        // will evaluate to 0. This is what we want, because in this case, index 0 corresponds
        // to the best repay asset
        // ---
        // If `ableToPickBest === false`, then we have to decide which diagonal to take from a
        // matrix like the following:
        // top repay: [cETH: 3, cDAI: 0.5]
        // top seize: [cETH: 1, cZRX: 1.1]
        // If top-right is greater than bottom-right, then to maximize revenue we use the upward
        // slanting diagonal, and vice versa. If you need to convince yourself that this logic
        // is correct, play around with the numbers in the table. Remember that in a given row,
        // index 0 must be greater than index 1.
        // In the case that everything in the second column is `null`, either `repayIdx` or
        // `seizeIdx` will point to null, which we take care of later. If just the top-right
        // is `null`, then `null > AnyNumber` evaluates to `false`, and `repayIdx` will be 0,
        // avoiding the missing value. If just the bottom-right is `null`, then `AnyNumber > null`
        // evaluates to `true`, and `repayIdx` will be 1, again avoiding the missing value! Yay!
        const repayIdx = Number(
          !ableToPickBest && top2RepayAmnts_Eth[1] > top2SeizeAmnts_Eth[1]
        );
        // If `ableToPickBest === true`, then the statement will evaluate to 0. Again, this is
        // what we want, because in this case, index 0 corresponds to the best seize asset
        // ---
        // If `ableToPickBest === false`, then we'll get `Number(!repayIdx)`. This will force
        // `seizeIdx` to be the opposite of `repayIdx` (diagonal to it in the matrix)
        const seizeIdx = Number(ableToPickBest ? false : !repayIdx);

        const assetToRepay = top2AssetsToRepay[repayIdx];
        const assetToSeize = top2AssetsToSeize[seizeIdx];
        const amounToRepay = top2RepayAmnts_Eth[repayIdx];
        const amounToSeize = top2SeizeAmnts_Eth[seizeIdx];

        if (assetToRepay !== null && assetToSeize !== null) {
          pairID = await this._tablePaySeizePairs.getID(
            assetToRepay,
            assetToSeize
          );
          profitability =
            Math.min(amounToRepay, amounToSeize) *
            (liquidationIncentive - 1.0 - 0.0009 - 0.003);
        }
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

  removeOlderThan(blockUpdated) {
    return this._pool.query(
      `DELETE FROM users WHERE blockupdated < ${blockUpdated};`
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

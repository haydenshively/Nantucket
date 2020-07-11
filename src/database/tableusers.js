class TableUsers {
  constructor(pool, tableCTokens, tablePaySeizePairs) {
    this._pool = pool;
    this._tableCTokens = tableCTokens;
    this._tablePaySeizePairs = tablePaySeizePairs;
  }

  async upsertAccountService(blockNo, accounts, closeFactor, liquidationIncentive) {
    for (let account of accounts) {
      let supply = 0.0;
      let borrow = 0.0;
      let bestAssetToClose = null;
      let bestAssetToSeize = null;
      let closingAmountEth_borrow = 0.0;
      let closingAmountEth_supply = 0.0;

      for (let token of account.tokens) {
        const cTokenID = await this._tableCTokens.getID(token.address().slice(2));

        const borrow_uUnits = Number(token.borrowBalanceUnderlying());
        const supply_uUnits = Number(token.supplyBalanceUnderlying());

        if (borrow_uUnits > 0.0) {
          const { collat, costineth } = await this.getCollatAndCost(cTokenID);
          const closable_Eth = borrow_uUnits * costineth * closeFactor;
          borrow += borrow_uUnits * costineth * collat;

          if (closable_Eth > closingAmountEth_borrow) {
            closingAmountEth_borrow = closable_Eth;
            bestAssetToClose = cTokenID;
          }
        }

        if (supply_uUnits > 0.0) {
          const { collat, costineth } = await this.getCollatAndCost(cTokenID);
          const closable_Eth = supply_uUnits * costineth / liquidationIncentive;
          supply += supply_uUnits * costineth;

          if (closable_Eth > closingAmountEth_supply) {
            closingAmountEth_supply = closable_Eth;
            bestAssetToSeize = cTokenID;
          }
        }
      }

      const liquidity = supply - borrow;
      const profitability = Math.min(closingAmountEth_borrow, closingAmountEth_supply) * (liquidationIncentive - 1.0);
      
      let pairID;
      if (bestAssetToClose === null || bestAssetToSeize === null) {
        pairID = null;
      }else {
        pairID = this._tablePaySeizePairs.getID(bestAssetToClose, bestAssetToSeize);
      }

      await this.upsert(account.address().slice(2), liquidity, profitability, pairID, blockNo);
    }
  }

  async upsert(address, liquidity, profitability, pairID, blockUpdated) {
    return this._pool.query(
      `
      INSERT INTO users (address, liquidity, profitability, pairid, blockupdated)
      VALUES ($1::text, $2, $3, $4, $5)
      ON CONFLICT (address) DO UPDATE
      SET liquidity=EXCLUDED.liquidity, profitability=EXCLUDED.profitability, pairid=EXCLUDED.pairid, blockupdated=EXCLUDED.blockupdated
      WHERE NEW.blockUpdated<=OLD.blockUpdated
      `,
      [ address, liquidity, profitability, pairID, blockUpdated ]
    );
  }

  async getCollatAndCost(cTokenID) {
    return (await this._pool.query(
      "SELECT collat, costineth FROM ctokunderlying WHERE id = $1",
      [cTokenID]
    )).rows[0];
  }
}

module.exports = TableUsers;

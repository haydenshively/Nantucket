const assert = require("assert");

const TableUTokens = require("../src/database/tableutokens");
const TableCTokens = require("../src/database/tablectokens");

const TxManager = require("../src/network/webthree/txmanager");
const Comptroller = require("../src/network/webthree/compound/comptroller");
const PriceOracle = require("../src/network/webthree/compound/priceoracle");
const Tokens = require("../src/network/webthree/compound/ctoken");

describe("integration", () => {
  const tableUTokens = new TableUTokens(pool);
  const tableCTokens = new TableCTokens(pool, tableUTokens);

  new TxManager("ACCOUNT_PUBLIC_KEY_B", "ACCOUNT_PRIVATE_KEY_B", 4);

  it("should liquidate one account", async function() {
    await TxManager.shared.init();

    targets = await pool.query(
      `
      SELECT usersnonzero.id, usersnonzero.address, payseizepairs.ctokenidpay, payseizepairs.ctokenidseize
      FROM usersnonzero INNER JOIN payseizepairs ON (usersnonzero.pairid=payseizepairs.id)
      WHERE usersnonzero.liquidity<1
      ORDER BY usersnonzero.profitability DESC
      LIMIT 5
      `
    );
    for (let target of targets.rows) {
      const gasPrice = 1.5 * (await web3.eth.getGasPrice());

      const userAddr = "0x" + target.address;
      const res = await Comptroller.mainnet.accountLiquidityOf(userAddr);
      if (res[1] > 0.0) {
        // Target has negative liquidity (positive shortfall). We're good to go
        const repayAddr =
          "0x" + (await tableCTokens.getAddress(target.ctokenidpay));
        const seizeAddr =
          "0x" + (await tableCTokens.getAddress(target.ctokenidseize));

        const closeFact = await Comptroller.mainnet.closeFactor();
        const liqIncent = await Comptroller.mainnet.liquidationIncentive();

        let repayAmnt =
          (closeFact - 0.0001) *
          (await Tokens.mainnetByAddr[repayAddr].uUnitsLoanedOutTo(userAddr));

        const ratio =
          (await PriceOracle.mainnet.getUnderlyingPrice(seizeAddr)) /
          (await PriceOracle.mainnet.getUnderlyingPrice(repayAddr));
        const seizeAmnt =
          (ratio *
            (await Tokens.mainnetByAddr[seizeAddr].uUnitsInContractFor(
              userAddr
            ))) /
          liqIncent;

        repayAmnt = Math.min(repayAmnt, seizeAmnt);
        
        console.log(userAddr);
        const tx = Tokens.mainnetByAddr[repayAddr].flashLiquidate_uUnits(
          userAddr,
          repayAmnt,
          seizeAddr,
          gasPrice
        );

        // TxManager.shared.insert(tx, 0, 6 * 60 * 1000);
      }
    }
  }).timeout(600000);
});

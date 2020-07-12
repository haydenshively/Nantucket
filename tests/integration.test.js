const assert = require("assert");

const TableUTokens = require("../src/database/tableutokens");
const TableCTokens = require("../src/database/tablectokens");

const EthAccount = require("../src/network/webthree/ethaccount");
const Comptroller = require("../src/network/webthree/compound/comptroller");
const Tokens = require("../src/network/webthree/compound/ctoken");

describe("integration", () => {
  const tableUTokens = new TableUTokens(pool);
  const tableCTokens = new TableCTokens(pool, tableUTokens);

  new EthAccount();

  it("should liquidate one account", async function() {
    targets = await pool.query(
      `
      SELECT usersnonzero.id, usersnonzero.address, payseizepairs.ctokenidpay, payseizepairs.ctokenidseize
      FROM usersnonzero INNER JOIN payseizepairs ON (usersnonzero.pairid=payseizepairs.id)
      WHERE usersnonzero.liquidity<0
      ORDER BY usersnonzero.profitability DESC
      LIMIT 1
      `
    );
    if (targets.rows.length > 0) {
      const target = targets.rows[0];
      const gasPrice = 3.0 * (await web3.eth.getGasPrice());

      const userAddr = "0x" + target.address;
      const res = await Comptroller.mainnet.accountLiquidityOf(userAddr);
      if (res[1] > 0.0) {
        // Target has negative liquidity (positive shortfall). We're good to go
        const repayAddr =
          "0x" + (await tableCTokens.getAddress(target.ctokenidpay));
        const seizeAddr =
          "0x" + (await tableCTokens.getAddress(target.ctokenidseize));

        const closeFact = await Comptroller.mainnet.closeFactor();

        const repayAmnt =
          (closeFact - 0.01) *
          (await Tokens.mainnetByAddr[repayAddr].uUnitsLoanedOutTo(userAddr));

        const tx = Tokens.mainnetByAddr[repayAddr].flashLiquidate_uUnits(
          userAddr,
          Math.floor(repayAmnt),
          seizeAddr,
          gasPrice
        );

        // EthAccount.shared.signAndSend(
        //   tx,
        //   await EthAccount.getHighestConfirmedNonce()
        // );
      }
    }
  });
});

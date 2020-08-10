// const assert = require("assert");

// const TableUTokens = require("../src/database/tableutokens");
// const TableCTokens = require("../src/database/tablectokens");

// const TxManager = require("../src/network/webthree/txmanager");
// const FlashLiquidator = require("../src/network/webthree/goldenage/flashliquidator");

// describe("integration", () => {
//   const tableUTokens = new TableUTokens(pool);
//   const tableCTokens = new TableCTokens(pool, tableUTokens);

//   const txManager = new TxManager(
//     "ACCOUNT_ADDRESS_B",
//     "ACCOUNT_SECRET_B",
//     5
//   );

//   it("should liquidate one account", async function() {
//     await txManager.init();

//     const tx = {
//       to: process.env[txManager._envKeyAddress],
//       gas: 21000,
//       gasPrice: 50000000000,
//       value: 0
//     };

//     const sentTx = await txManager._signAndSend(tx, 152)
//     console.log(sentTx);

//     // targets = await pool.query(
//     //   `
//     //   SELECT usersnonzero.id, usersnonzero.address, payseizepairs.ctokenidpay, payseizepairs.ctokenidseize
//     //   FROM usersnonzero INNER JOIN payseizepairs ON (usersnonzero.pairid=payseizepairs.id)
//     //   WHERE usersnonzero.liquidity<1
//     //   ORDER BY usersnonzero.profitability DESC
//     //   LIMIT 3
//     //   `
//     // );
//     // let borrowers = [];
//     // let repayCTokens = [];
//     // let seizeCTokens = [];

//     // for (let target of targets.rows) {
//     //   borrowers.push("0x" + String(target.address));
//     //   repayCTokens.push(
//     //     "0x" + (await tableCTokens.getAddress(target.ctokenidpay))
//     //   );
//     //   seizeCTokens.push(
//     //     "0x" + (await tableCTokens.getAddress(target.ctokenidseize))
//     //   );
//     // }

//     // const tx = FlashLiquidator.mainnet.liquidateMany(
//     //   borrowers,
//     //   repayCTokens,
//     //   seizeCTokens,
//     //   1.4 * (await web3.eth.getGasPrice()) / 1e9
//     // );

//     // console.log(tx);

//     // txManager.insert(tx, 0, 6 * 60 * 1000);
//   }).timeout(600000);
// });

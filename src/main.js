const winston = require("winston");

// src
const Database = require("./database");
// src.network.webthree
const Comptroller = require("./network/webthree/compound/comptroller");
const FlashLiquidator = require("./network/webthree/goldenage/flashliquidator");
const Tokens = require("./network/webthree/compound/ctoken");

class Main extends Database {
  constructor(
    feeMinMultiplier,
    feeMaxMultiplier,
    minRevenueFeeRatio,
    numLowCandidates,
    maxRevenueToBeLow,
    highRevenueThresh,
    numHighCandidates
  ) {
    /**
     * Constructs a `Main` object
     *
     * @param {number} feeMinMultiplier When sending transactions, use
     *    market-recommended gas price multiplied by this amount
     * @param {number} feeMaxMultiplier When sending transactions for
     *    high-valued targets, scale gas price up to this many times its
     *    market-recommended value
     * @param {number} minRevenueFeeRatio When choosing liquidation
     *    candidates, ensure (revenue / fee) is greater than this number
     * @param {number} numLowCandidates After applying the
     *    `minRevenueFeeRatio` threshold, users are ranked by liquidity
     *    (lowest to highest). This specifies how many candidates
     *    should be taken from the top of that list
     * @param {number} maxRevenueToBeLow Any user with potential revenue
     *    greater than this number will be excluded when choosing low-value
     *    candidates
     * @param {number} highRevenueThresh When choosing high-value liquidation
     *    candidates, ensure the revenue is greater than this amount
     * @param {number} numHighCandidates This specifies how many candidates
     *    should be taken from the portion of the user list with revenue >
     *    highRevenueThresh
     *
     */
    super();

    this._feeMinMultiplier = feeMinMultiplier;
    this._feeMaxMultiplier = feeMaxMultiplier;
    this._minRevenueFeeRatio = minRevenueFeeRatio;
    this._numLowCandidates = Math.floor(numLowCandidates);
    this._maxRevenueToBeLow = maxRevenueToBeLow;
    this._highRevenueThresh = highRevenueThresh;
    this._numHighCandidates = Math.floor(numHighCandidates);

    this._liquiCandidates = [];
    this._prepared_tx_data = {
      borrowers: [],
      repayCTokens: [],
      seizeCTokens: []
    };
  }

  async getGasPrice(forHighValueTarget = false) {
    const marketValue = Number(await web3.eth.getGasPrice()) / 1e9;

    return (
      marketValue *
      (forHighValueTarget ? this._feeMaxMultiplier : this._feeMinMultiplier)
    );
  }

  async getTxFee_Eth(forHighValueTarget = false, gas = 1000000) {
    return (await this.getGasPrice(forHighValueTarget)) * (gas / 1e9);
  }

  _liquiCandidatesClear() {
    this._liquiCandidates = [];
  }

  async _liquiCandidatesConcat(count, min_Eth, max_Eth = 100000) {
    this._liquiCandidates = this._liquiCandidates.concat(
      await this._tUsers.getLiquidationCandidates(count, min_Eth, max_Eth, 1.15)
    );
  }

  async updateLiquidationCandidates() {
    this._liquiCandidatesClear();

    await this._liquiCandidatesConcat(
      this._numLowCandidates,
      (await this.getTxFee_Eth()) * this._minRevenueFeeRatio,
      this._maxRevenueToBeLow
    );
    await this._liquiCandidatesConcat(
      this._numHighCandidates,
      this._highRevenueThresh
    );
  }

  async onNewBlock(blockNumber) {
    const gasPrice = Number(await web3.eth.getGasPrice()) / 1e9;
    const estTxFee_Eth = gasPrice / 1000;
    const ethPrice_USD = 1.0 / (await Tokens.mainnet.cUSDC.priceInEth());

    for (let i of this._liquiCandidates) {
      // this is pairID DAI and SAI. There's no AAVE pool for it.
      if (i.ctokenidpay == 2 || (i.ctokenidpay == 6 && i.ctokenidseize == 2))
        continue;

      // get the target user's address as a string
      const addr = `0x${i.address}`;
      const label = addr.slice(0, 6);

      // get the user's liquidity
      const liquidity = await Comptroller.mainnet.accountLiquidityOf(addr);
      if (liquidity === null) {
        winston.log(
          "warn",
          `🚨 *Proposal ${label}* | Failed to retrieve liquidity and shortfall from Comptroller`
        );
        continue;
      }

      // check if target has negative liquidity (positive shortfall)
      if (liquidity[1].gt(0.0)) {
        // retrieve addresses for pre-computed best repay and seize tokens
        const repayT = `0x${await this._tCTokens.getAddress(i.ctokenidpay)}`;
        const seizeT = `0x${await this._tCTokens.getAddress(i.ctokenidseize)}`;

        // estimate profit and log it
        const profit = ethPrice_USD.times(i.profitability - estTxFee_Eth);
        winston.log(
          "info",
          `🐳 *Proposal ${label}* | Liquidating for $${profit.toFixed(
            2
          )} profit at block ${blockNumber}`
        );

        const tx = FlashLiquidator.mainnet.liquidateMany(
          [addr],
          [repayT],
          [seizeT],
          gasPrice *
            (i.profitability >= this._highRevenueThresh
              ? this._feeMaxMultiplier
              : this._feeMinMultiplier)
        );

        process.send({
          tx: tx,
          priority: i.profitability,
          key: addr
        });
      }
    }
  }

  onNewLiquidation(event) {
    if (event.liquidator == FlashLiquidator.mainnet.address)
      return;
    const addr = event.borrower;
    const addrs = this._liquiCandidates.map(t => `0x${t.address}`);

    if (!addrs.includes(addr.toLowerCase())) {
      winston.log(
        "info",
        `⤼ *Liquidate Event* | Didn't liquidate ${addr.slice(
          0,
          6
        )} because they weren't in the candidates list`
      );
    } else {
      winston.log(
        "warn",
        `🚨 *Liquidate Event* | Didn't liquidate ${addr.slice(
          0,
          6
        )} based on JS logic (or lost gas bidding war)`
      );
    }
  }
}

module.exports = Main;

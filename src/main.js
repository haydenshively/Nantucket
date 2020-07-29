const winston = require("winston");

// src
const Candidate = require("./candidate");
const Database = require("./database");
// src.network.web
const Tickers = require("./network/web/coinbase/ticker");
// src.network.webthree
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
    this._prepared_tx_data = [];
  }

  async getGasPrice(forHighValueTarget = false) {
    const marketValue = Number(await web3.eth.getGasPrice()) / 1e9;

    return (
      marketValue *
      (forHighValueTarget ? this._feeMaxMultiplier : this._feeMinMultiplier)
    );
  }

  async getTxFee_Eth(forHighValueTarget = false, gas = 2000000) {
    return (await this.getGasPrice(forHighValueTarget)) * (gas / 1e9);
  }

  _liquiCandidatesClear() {
    this._liquiCandidates = [];
  }

  async _liquiCandidatesConcat(count, min_Eth, max_Eth = 100000) {
    const cs = await this._tUsers.getLiquidationCandidates(
      count,
      min_Eth,
      max_Eth,
      1.15
    );
    this._liquiCandidates = this._liquiCandidates.concat(
      cs.map(c => new Candidate(c))
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
    const oldNumInPriceWave = this._prepared_tx_data.length;
    this._prepared_tx_data = [];

    const gasPrice = Number(await web3.eth.getGasPrice()) / 1e9;
    const estTxFee_Eth = gasPrice / 500;
    const ethPrice_USD =
      1.0 / (await Tokens.mainnet.cUSDC.priceInEth()).toFixed(8);

    let totalProfit = 0.0;

    for (let i of this._liquiCandidates) {
      // this is pairID DAI and SAI. There's no AAVE pool for it.
      if (i.ctokenidpay == 2 || (i.ctokenidpay == 6 && i.ctokenidseize == 2))
        continue;

      // retrieve addresses for pre-computed best repay and seize tokens
      const repayT = `0x${await this._tCTokens.getAddress(i.ctokenidpay)}`;
      const seizeT = `0x${await this._tCTokens.getAddress(i.ctokenidseize)}`;

      if (await i.isLiquidatable()) {
        // estimate profit and log it
        const profit = ethPrice_USD * (i.profitability - estTxFee_Eth);
        winston.log(
          "info",
          `🐳 *Proposal ${i.label}* | Liquidating for $${profit.toFixed(
            2
          )} profit at block ${blockNumber}`
        );

        const tx = FlashLiquidator.mainnet.liquidateMany(
          [i.address],
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
          key: i.address
        });
      } else if ((await i.liquidityOffChain(Tickers.mainnet)) < 0.0) {
        totalProfit += ethPrice_USD * (i.profitability - estTxFee_Eth);

        this._prepared_tx_data.push({
          borrower: i.address,
          repayCToken: repayT,
          seizeCToken: seizeT
        });
      }
    }

    Tickers.mainnet.update();

    const newNumInPriceWave = this._prepared_tx_data.length;
    if (oldNumInPriceWave === newNumInPriceWave) return;
    if (oldNumInPriceWave > newNumInPriceWave)
      winston.log(
        "info",
        `🌊 *Price Wave* | Removed ${oldNumInPriceWave -
          newNumInPriceWave} candidates for a new total profit of $${totalProfit.toFixed(
          2
        )} if prices get posted`
      );
    else
      winston.log(
        "info",
        `🌊 *Price Wave* | Added ${newNumInPriceWave -
          oldNumInPriceWave} candidates for a new total profit of $${totalProfit.toFixed(
          2
        )} if prices get posted`
      );
  }

  onNewPricesOnChain(oracleTx) {
    winston.log(
      "info",
      `🏷 *Prices Posted* | ${this._prepared_tx_data.length} item(s) in wave queue`
    );
    if (this._prepared_tx_data.length === 0) return;

    this._prepared_tx_data = this._prepared_tx_data.slice(0, 6);

    const borrowers = this._prepared_tx_data.map(d => d.borrower);
    const repayCTokens = this._prepared_tx_data.map(d => d.repayCToken);
    const seizeCTokens = this._prepared_tx_data.map(d => d.seizeCToken);

    this._prepared_tx_data = [];

    const txA = FlashLiquidator.mainnet.liquidateMany(
      borrowers,
      repayCTokens,
      seizeCTokens,
      oracleTx.gasPrice / 1e9
    );
    const txB = FlashLiquidator.mainnet.liquidateMany(
      borrowers,
      repayCTokens,
      seizeCTokens,
      (oracleTx.gasPrice + 100) / 1e9
    );

    process.send({
      tx: txB,
      priority: 1001,
      key: borrowers[1]
    });
    process.send({
      tx: txA,
      priority: 1000,
      key: borrowers[0]
    });
  }

  onNewLiquidation(event) {
    if (event.liquidator == FlashLiquidator.mainnet.address) return;
    const addr = event.borrower;
    const candidate = this._liquiCandidates.filter(
      c => c.address === addr.toLowerCase()
    );

    if (candidate.length === 0) {
      winston.log(
        "info",
        `⤼ *Liquidate Event* | Didn't liquidate ${addr.slice(
          0,
          6
        )} because they weren't a candidate.`
      );
    } else {
      winston.log(
        "warn",
        `🚨 *Liquidate Event* | Didn't liquidate ${addr.slice(
          0,
          6
        )} due to bad logic (or gas war). In list ${candidate.length} times`
      );
    }
  }
}

module.exports = Main;

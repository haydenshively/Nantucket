const winston = require("winston");

// src
const Database = require("./database");
// src.network.webthree
const Comptroller = require("./network/webthree/compound/comptroller");
const PriceOracle = require("./network/webthree/compound/priceoracle");
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
    const closeFact = await Comptroller.mainnet.closeFactor();
    const liqIncent = await Comptroller.mainnet.liquidationIncentive();
    const gasPrice = Number(await web3.eth.getGasPrice()) / 1e9;
    const estTxFee_Eth = gasPrice / 1000;

    let uPrices = {};

    for (let target of this._liquiCandidates) {
      // this is pairID DAI and SAI. There's no AAVE pool for it.
      if (
        target.ctokenidpay == 2 ||
        (target.ctokenidpay == 6 && target.ctokenidseize == 2)
      )
        continue;

      // get the target user's address as a string
      const userAddr = "0x" + target.address;
      const label = userAddr.slice(0, 6);

      // check if user can be liquidated
      Comptroller.mainnet.accountLiquidityOf(userAddr).then(async res => {
        if (res === null) {
          winston.log(
            "warn",
            `🚨 *Proposal ${label}* | Failed to retrieve liquidity and shortfall from Comptroller`
          );
          return;
        }
        // check if target has negative liquidity
        if (res[1].gt(0.0)) {
          // retrieve addresses for pre-computed best repay and seize tokens
          const repayAddr =
            "0x" + (await this._tCTokens.getAddress(target.ctokenidpay));
          const seizeAddr =
            "0x" + (await this._tCTokens.getAddress(target.ctokenidseize));
          // if we haven't yet obtained this block's underlying prices for
          // the tokens in question, get them and store them
          // (storing them may increase CPU/RAM usage slightly, but it cuts
          // down on async calls to the Ethereum node)
          if (!(repayAddr in uPrices))
            uPrices[repayAddr] = await PriceOracle.mainnet.getUnderlyingPrice(
              Tokens.mainnetByAddr[repayAddr]
            );
          if (!(seizeAddr in uPrices))
            uPrices[seizeAddr] = await PriceOracle.mainnet.getUnderlyingPrice(
              Tokens.mainnetByAddr[seizeAddr]
            );
          // compute max repayAmnt = uUnitsBorrowed * closeFactor
          // compute max seizeAmnt = uUnitsSupplied / liquidationIncentive
          const repayMax = (
            await Tokens.mainnetByAddr[repayAddr].uUnitsBorrowedBy(userAddr)
          ).times(closeFact);
          const seizeMax = (
            await Tokens.mainnetByAddr[seizeAddr].uUnitsSuppliedBy(userAddr)
          ).div(liqIncent);
          // to get safe repayAmnt, compare with seizeAmnt (after converting units)
          const repayMax_Eth = repayMax.times(uPrices[repayAddr]);
          const seizeMax_Eth = seizeMax.times(uPrices[seizeAddr]);

          const repay_Eth = repayMax_Eth.gt(seizeMax_Eth)
            ? seizeMax_Eth
            : repayMax_Eth;
          let repay = repay_Eth.div(uPrices[repayAddr]);
          repay = repay.times(0.9999);

          // make sure revenue meets minimums
          const revenue = repay_Eth.times(liqIncent.minus(1.0));
          if (revenue.div(estTxFee_Eth).lte(this._minRevenueFeeRatio)) {
            winston.log(
              "warn",
              `🐳 *Proposal ${label}* | Revenue/Fee ratio too low, token pair likely stale`
            );
            return;
          }
          winston.log(
            "info",
            `🐳 *Proposal ${label}* | Liquidating for ${revenue.toFixed(
              2
            )} Eth reward at block ${blockNumber}`
          );

          const tx = Tokens.mainnetByAddr[repayAddr].flashLiquidate_uUnits(
            userAddr,
            repay,
            seizeAddr,
            gasPrice *
              (target.profitability >= this._highRevenueThresh
                ? this._feeMaxMultiplier
                : this._feeMinMultiplier)
          );

          process.send({
            tx: tx,
            priority: target.profitability,
            key: userAddr
          });
        }
      });
    }
  }

  onNewLiquidation(event) {
    if (event.liquidator == "0xFb3c1a8B2Baa50caF52093d7AF2450a143dbb212")
      return;
    const target = event.borrower;
    const targets = this._liquiCandidates.map(t => "0x" + t.address);

    if (!targets.includes(target.toLowerCase())) {
      winston.log(
        "info",
        `⤼ *Liquidate Event* | Didn't liquidate ${target.slice(
          0,
          6
        )} because they weren't in the candidates list`
      );
    } else {
      winston.log(
        "warn",
        `🚨 *Liquidate Event* | Didn't liquidate ${target.slice(
          0,
          6
        )} based on JS logic (or lost gas bidding war)`
      );
    }
  }
}

module.exports = Main;

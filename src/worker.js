// src
const Database = require("./database");
// src.messaging
const Candidate = require("./messaging/candidate");
const Channel = require("./messaging/channel");
const Message = require("./messaging/message");
const Oracle = require("./messaging/oracle");
// src.network.webthree
const Comptroller = require("./network/webthree/compound/comptroller");
const CTokens = require("./network/webthree/compound/ctoken");

/**
 * Given a list of candidates, this worker will determine which
 * ones are liquidatable on- and off- chain. It sends positive
 * results back over IPC.
 *
 * __IPC Messaging:__
 *
 * _Subscriptions:_
 * - Oracles>Set | Sets the worker's oracle to the one in the message ✅
 * - Messages>UpdateCandidates | Retrieves updated candidates list from ✅
 *    the datbase
 * - Messages>CheckCandidatesLiquidity | Iterates through candidates list
 *    and broadcasts those that are liquidatable ✅
 * - Messages>MissedOpportunity | Removes the borrower given by
 *    `msg.__data.address` ✅
 *
 * _Broadcasts_:
 * - Candidates>Liquidate | The candidate can be liquidated without
 *    price updates ✅
 * - Candidates>LiquidateWithPriceUpdate | Same idea, but price updates
 *    are required ✅
 * - Messages>CheckCandidatesLiquidityComplete | Finished running code
 *    that was triggered by a CheckCandidatesLiquidity message. The
 *    time it took to run (in ms) is given by `msg.__data.time` ✅
 */
class Worker extends Database {
  /**
   * @param {number} minRevenue Any user with potential revenue less
   *    than this number will be excluded when choosing candidates
   * @param {number} maxRevenue Any user with potential revenue greater
   *    than this number will be excluded when choosing candidates
   * @param {number} maxHealth Any user with a health greater than this
   *    number will be excluded when choosing candidates
   * @param {number} numCandidates Users are ranked by liquidity
   *    (lowest to highest). This specifies how many candidates
   *    should be taken from the top of that list
   */
  constructor(minRevenue, maxRevenue, maxHealth, numCandidates) {
    super();

    this._minRevenue = minRevenue;
    this._maxRevenue = maxRevenue;
    this._maxHealth = maxHealth;
    this._numCandidates = Math.floor(numCandidates);

    this._oracle = null;
    this._candidates = [];

    Channel(Oracle).on("Set", oracle => (this._oracle = oracle));
    Channel(Message).on("UpdateCandidates", _ =>
      this.updateCandidates.bind(this)()
    );
    Channel(Message).on("CheckCandidatesLiquidity", _ =>
      this.checkCandidatesLiquidity.bind(this)()
    );
    Channel(Message).on("MissedOpportunity", msg =>
      this._removeCandidate.bind(this)(msg.__data.address)
    );
  }

  async updateCandidates() {
    this._candidates = (
      await this._tUsers.getLiquidationCandidates(
        this._numCandidates,
        this._minRevenue,
        this._maxRevenue,
        this._maxHealth
      )
    ).map(c => new Candidate(c));

    // TODO after doing this to initialize the candidate,
    // they should get updated by subscribing to borrow/supply
    // events on the blockchain
    for (let i = 0; i < this._candidates.length; i++)
      await this._candidates[i].refreshBalances(
        web3,
        Comptroller.mainnet,
        CTokens.mainnet
      );
  }

  async checkCandidatesLiquidity() {
    const timestampStart = Date.now();

    for (let i = 0; i < this._candidates.length; i++) {
      const c = this._candidates[i];
      // this is pairID DAI and SAI. There's no AAVE pool for it.
      if (c.ctokenidpay == 2 || (c.ctokenidpay == 6 && c.ctokenidseize == 2))
        continue;

      if (c._markets === null) continue;

      // TODO TxManager isn't hooked into the Database logic, so we have
      // to pass along the repay and seize addresses here
      // (ctokenidpay and ctokenidseize are normally Ints, but here
      // they change to Strings)
      if (!String(c.ctokenidpay).startsWith("0x")) {
        const repay = `0x${await this._tCTokens.getAddress(c.ctokenidpay)}`;
        this._candidates[i].ctokenidpay = repay;
      }
      if (!String(c.ctokenidseize).startsWith("0x")) {
        const seize = `0x${await this._tCTokens.getAddress(c.ctokenidseize)}`;
        this._candidates[i].ctokenidseize = seize;
      }

      if (
        this._oracle !== null &&
        (await c.isLiquidatableWithPriceFrom(this._oracle))
      ) {
        this._candidates[i].msg().broadcast("LiquidateWithPriceUpdate");
        continue;
      }
      if (await c.isLiquidatable(web3, Comptroller.mainnet)) {
        this._candidates[i].msg().broadcast("Liquidate");
      }
    }

    const liquidityCheckTime = Date.now() - timestampStart;
    new Message({ time: liquidityCheckTime }).broadcast(
      "CheckCandidatesLiquidityComplete"
    );
  }

  _removeCandidate(address) {
    for (let i = 0; i < this._candidates.length; i++) {
      if (this._candidates[i].address !== address) continue;
      this._candidates.splice(i, 1);
      break;
    }
  }
}

module.exports = Worker;

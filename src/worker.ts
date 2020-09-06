// src
import Database from "./database";
// src.messaging
import Candidate from "./messaging/candidate";
import Channel from "./messaging/channel";
import Message from "./messaging/message";
import Oracle from "./messaging/oracle";
// src.network.webthree
import Comptroller from "./network/webthree/compound/comptroller";
import CToken from "./network/webthree/compound/ctoken";
import { EthNet } from "./network/webthree/ethnet";

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
  private minRevenue: number;
  private maxRevenue: number;
  private maxHealth: number;
  private numCandidates: number;
  private oracle: any;
  private candidates: any[];
  private web3: any;

  constructor(minRevenue: number, maxRevenue: number, maxHealth: number, numCandidates: number, web3: any) {
    super();

    this.minRevenue = minRevenue;
    this.maxRevenue = maxRevenue;
    this.maxHealth = maxHealth;
    this.numCandidates = Math.floor(numCandidates);

    this.oracle = null;
    this.candidates = [];
    this.web3 = web3;

    Channel.for(Oracle).on("Set", (oracle: any) => (this.oracle = oracle));
    Channel.for(Message).on("UpdateCandidates", _ =>
      this.updateCandidates.bind(this)()
    );
    Channel.for(Message).on("CheckCandidatesLiquidity", _ =>
      this.checkCandidatesLiquidity.bind(this)()
    );
    Channel.for(Message).on("MissedOpportunity", msg =>
      this.removeCandidate.bind(this)(msg.__data.address)
    );
  }

  async updateCandidates() {
    this.candidates = (
      await this._tUsers.getLiquidationCandidates(
        this.numCandidates,
        this.minRevenue,
        this.maxRevenue,
        this.maxHealth
      )
    ).map((c: any) => new Candidate(c));
  }

  async checkCandidatesLiquidity() {
    const timestampStart = Date.now();

    for (let i = 0; i < this.candidates.length; i++) {
      const c = this.candidates[i];
      // this is pairID DAI and SAI. There's no AAVE pool for it.
      if (c.ctokenidpay == 2 || (c.ctokenidpay == 6 && c.ctokenidseize == 2))
        continue;

      // TODO instead of this (which won't work with any Web3 provider except
      // the local Geth node due to latency issues) just subscribe to Compound
      // events for "borrow" and "supply" and update based on that.
      await c.refreshBalances(
        this.web3,
        Comptroller.forNet(EthNet.mainnet),
        // TODO: Adjust this to use symbols for ctokens in Candidate
        CToken.forNet(EthNet.mainnet, null)
      );

      // TODO TxManager isn't hooked into the Database logic, so we have
      // to pass along the repay and seize addresses here
      // (ctokenidpay and ctokenidseize are normally Ints, but here
      // they change to Strings)
      if (!String(c.ctokenidpay).startsWith("0x")) {
        const repay = `0x${await this._tCTokens.getAddress(c.ctokenidpay)}`;
        this.candidates[i].ctokenidpay = repay;
      }
      if (!String(c.ctokenidseize).startsWith("0x")) {
        const seize = `0x${await this._tCTokens.getAddress(c.ctokenidseize)}`;
        this.candidates[i].ctokenidseize = seize;
      }

      if (
        this.oracle !== null &&
        (await c.isLiquidatableWithPriceFrom(this.oracle))
      ) {
        this.candidates[i].msg().broadcast("LiquidateWithPriceUpdate");
        continue;
      }
      if (await c.isLiquidatable(this.web3, Comptroller.forNet(EthNet.mainnet))) {
        this.candidates[i].msg().broadcast("Liquidate");
      }
    }

    const liquidityCheckTime = Date.now() - timestampStart;
    new Message({ time: liquidityCheckTime }).broadcast(
      "CheckCandidatesLiquidityComplete"
    );
  }

  removeCandidate(address: string) {
    for (let i = 0; i < this.candidates.length; i++) {
      if (this.candidates[i].address !== address) continue;
      this.candidates.splice(i, 1);
      break;
    }
  }
}

module.exports = Worker;

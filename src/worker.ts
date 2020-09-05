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
 *
 * _Broadcasts_:
 * - Candidates>Liquidate | The candidate can be liquidated without
 *    price updates ✅
 * - Candidates>LiquidateWithPriceUpdate | Same idea, but price updates
 *    are required ✅
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
    for (let i = 0; i < this.candidates.length; i++) {
      const c = this.candidates[i];
      // this is pairID DAI and SAI. There's no AAVE pool for it.
      if (c.ctokenidpay == 2 || (c.ctokenidpay == 6 && c.ctokenidseize == 2))
        continue;

      await c.refreshBalances(
        this.web3,
        Comptroller.forNet(EthNet.mainnet),
        // TODO: Adjust this to use symbols for ctokens in Candidate
        CToken.forNet(EthNet.mainnet, null)
      );

      // TODO TxManager isn't hooked into the Database logic, so we have
      // to pass along the repay and seize addresses here
      if (!String(c.ctokenidpay).startsWith("0x")) {
        const repay = `0x${await this._tCTokens.getAddress(c.ctokenidpay)}`;
        this.candidates[i].ctokenidpay = repay;
      }
      if (!String(c.ctokenidseize).startsWith("0x")) {
        const seize = `0x${await this._tCTokens.getAddress(c.ctokenidseize)}`;
        this.candidates[i].ctokenidseize = seize;
      }

      // In the code below, if .splice(i, 1) isn't called, the code
      // will try to liquidate people over and over
      if (
        this.oracle !== null &&
        (await c.isLiquidatableWithPriceFrom(this.oracle))
      ) {
        this.candidates[i].msg().broadcast("LiquidateWithPriceUpdate");
        this.candidates.splice(i, 1);
        return;
      }
      if (await c.isLiquidatable(this.web3, Comptroller.forNet(EthNet.mainnet))) {
        this.candidates[i].msg().broadcast("Liquidate");
        this.candidates.splice(i, 1);
      }
    }
  }
}

module.exports = Worker;

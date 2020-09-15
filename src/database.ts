// src.database
import TableUTokens from "./database/tableutokens";
import { Pool } from "pg";
import TableCTokens from "./database/tablectokens";
import TablePaySeizePairs from "./database/tablepayseizepairs";
import TableUsers from "./database/tableusers";

// src.network.web
import AccountService from "./network/web/compound/accountservice";
import CTokenService from "./network/web/compound/ctokenservice";

// src.network.webthree
import Comptroller from "./network/webthree/compound/comptroller";
import { EthNet } from "./network/webthree/ethnet";

export default class Database {

  private readonly pool: Pool;
  private readonly tUTokens: TableUTokens;
  private readonly tPairs: TablePaySeizePairs;
  private accountService: AccountService;
  private ctokenService: CTokenService;

  // Current provider is Web3
  protected readonly provider: any;
  protected readonly tCTokens: TableCTokens;
  protected tUsers: TableUsers;

  constructor(provider: any) {

    this.provider = provider;

    // Prepare to interact with database
    this.pool = new Pool({
      max: 30,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    // Prepare to interact with database tables
    this.tUTokens = new TableUTokens(this.pool);
    this.tCTokens = new TableCTokens(this.pool, this.tUTokens);
    this.tPairs = new TablePaySeizePairs(this.pool, this.tCTokens);
    this.tUsers = new TableUsers(this.pool, this.tCTokens, this.tPairs);

    // Prepare to interact with web 2.0 APIs
    this.accountService = new AccountService();
    this.ctokenService = new CTokenService();
  }

  async pullFromCTokenService() {
    const res = await this.ctokenService.fetch({});
    if (res.error) {
      console.warn("Fetch cTokenService failed: " + res.error.toString());
      return;
    }

    const tokens = res.tokens;
    await this.tUTokens.upsertCTokenService(tokens);
    await this.tCTokens.upsertCTokenService(tokens);
    await this.tPairs.insertCTokenService(tokens);
  }

  async pullFromAccountService() {
    // Currently this function is limited to mainnet access since the
    // database is designed to match mainnet, not testnets
    const blockLabel = (await this.provider.eth.getBlockNumber()) - 20;
    const closeFact = Number(await Comptroller.forNet(EthNet.mainnet).closeFactor()(this.provider));
    const liqIncent = Number(await Comptroller.forNet(EthNet.mainnet).liquidationIncentive()(this.provider));

    // 0 means pull most recent block
    // We label it with an older block number to avoid overwriting fresher
    // data from on-chain calls
    await this.accountService.fetchAll(0, accounts => {
      this.tUsers.upsertAccountService(
        blockLabel,
        accounts,
        closeFact,
        liqIncent
      );
    });
  }

  stop() {
    this.pool.end();
  }
}

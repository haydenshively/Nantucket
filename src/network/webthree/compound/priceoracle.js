const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Contract = require("../smartcontract");
const PRICEORACLEABI = require("../abis/mainnet/compound/priceoracle.json");

class PriceOracle extends Contract {
  async getUnderlyingPriceUSD(cToken) {
    return Big(
      await this.contract.methods.getUnderlyingPrice(cToken.address).call()
    )
      .div(1e18)
      .div(1e18 / cToken.decimals);
  }
}

exports.PriceOracle = PriceOracle;
exports.mainnet = new PriceOracle(
  "0x9B8Eb8b3d6e2e0Db36F41455185FEF7049a35CaE",
  PRICEORACLEABI
);
exports.ropsten = new PriceOracle(
  "0xe23874df0276AdA49D58751E8d6E088581121f1B",
  PRICEORACLEABI
);

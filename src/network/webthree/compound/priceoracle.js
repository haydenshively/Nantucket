const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Contract = require("../smartcontract");
const PRICEORACLEABI = require("../abis/compound/priceoracle.json");

class PriceOracle extends Contract {
  async getUnderlyingPrice(cToken) {
    return Big(
      await this.contract.methods.getUnderlyingPrice(cToken.address).call()
    )
      .div(1e18)
      .div(1e18 / cToken.decimals);
  }
}

exports.PriceOracle = PriceOracle;
exports.mainnet = new PriceOracle(
  "0xddc46a3b076aec7ab3fc37420a8edd2959764ec4",
  PRICEORACLEABI
);

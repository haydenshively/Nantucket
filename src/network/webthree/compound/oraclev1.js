const Contract = require("../smartcontract");
const ORACLEV1ABI = require("../abis/compound/oraclev1.json");

class OracleV1 extends Contract {
  async getPriceOf(uTokenAddress) {
    return this.contract.methods.getPrice(uTokenAddress).call();
  }
}

exports.OracleV1 = OracleV1;
exports.mainnet = new OracleV1(
  "0x02557a5E05DeFeFFD4cAe6D83eA3d173B272c904",
  ORACLEV1ABI
);

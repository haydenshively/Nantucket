const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const SmartContract = require("../smartcontract");

class PriceOracle extends SmartContract {
  getUnderlyingPriceUSD(cToken) {
    const method = this._inner.methods.getUnderlyingPrice(cToken.address);
    return this._callerForUint256(method, x =>
      x.div(1e18).div(1e18 / cToken.decimals)
    );
  }
}

const addresses = {
  mainnet: "0x9B8Eb8b3d6e2e0Db36F41455185FEF7049a35CaE",
  ropsten: "0xe23874df0276AdA49D58751E8d6E088581121f1B"
};

for (let net in addresses) {
  const abi = require(`../abis/${net}/compound/priceoracle.json`);
  exports[net] = new PriceOracle(addresses[net], abi);
}

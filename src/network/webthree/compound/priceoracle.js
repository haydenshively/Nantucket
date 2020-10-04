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
  mainnet: "0x922018674c12a7F0D394ebEEf9B58F186CdE13c1",
  ropsten: "0xb2b3d5B4E35881D518fa2062325F118A6Ebb6C4A"
};

for (let net in addresses) {
  const abi = require(`../abis/${net}/compound/priceoracle.json`);
  exports[net] = new PriceOracle(addresses[net], abi);
}

const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const SmartContract = require("../smartcontract");

class PriceOracle extends SmartContract {
  async getUnderlyingPriceUSD(cToken) {
    return Big(
      await this.contract.methods.getUnderlyingPrice(cToken.address).call()
    )
      .div(1e18)
      .div(1e18 / cToken.decimals);
  }
}

const addresses = {
  mainnet: "0x9B8Eb8b3d6e2e0Db36F41455185FEF7049a35CaE",
  ropsten: "0xe23874df0276AdA49D58751E8d6E088581121f1B"
};

for (let net in web3s) {
  const abi = require(`../abis/${net}/compound/priceoracle.json`);

  exports[net] = web3s[net].map(provider => {
    return new PriceOracle(addresses[net], abi, provider);
  });
}

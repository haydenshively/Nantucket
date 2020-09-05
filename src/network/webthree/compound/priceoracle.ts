import Big from "../../../big";
import SmartContract from "../smartcontract";
import { EthNet, MultiEthNet } from "../ethnet";
import { staticImplements } from "../../../utils";

const addresses = {
  [EthNet.mainnet]: "0x9B8Eb8b3d6e2e0Db36F41455185FEF7049a35CaE",
  [EthNet.ropsten]: "0xe23874df0276AdA49D58751E8d6E088581121f1B"
};

@staticImplements<MultiEthNet>()
class PriceOracle extends SmartContract {

  public static forNet(network: EthNet): PriceOracle {
    const abi = require(`../abis/${network}/compound/priceoracle.json`);
    return new PriceOracle(addresses[network], abi);
  }

  getUnderlyingPriceUSD(cToken) {
    const method = this.inner.methods.getUnderlyingPrice(cToken.address);
    return this._callerForUint256(method, x =>
      x.div(1e18).div(1e18 / cToken.decimals)
    );
  }
}

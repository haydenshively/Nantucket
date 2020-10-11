import Big from "../../../big";
import SmartContract from "../smartcontract";
import { EthNet, MultiEthNet } from "../ethnet";
import { staticImplements } from "../../../utils";

const addresses = {
  [EthNet.mainnet]: "0x9B8Eb8b3d6e2e0Db36F41455185FEF7049a35CaE",
  [EthNet.ropsten]: "0xe23874df0276AdA49D58751E8d6E088581121f1B"
};

// Cache the abi json files in memory at import time to avoid I/O during runtime
const abiMap: Map<EthNet, any> = new Map();
for (let network in addresses) {
  let ethnet: EthNet = EthNet[network as keyof typeof EthNet];
  abiMap.set(ethnet, require(`../abis/${network}/compound/priceoracle.json`));
}

@staticImplements<MultiEthNet>()
export default class PriceOracle extends SmartContract {

  /**
   * Factory method for constructing an instance of PriceOracle on a given
   * Ethereum network.
   * @param network - the network (mainnet or a testnet) to build on.
   */
  public static forNet(network: EthNet): PriceOracle {
    const abi = abiMap.get(network);
    return new PriceOracle(addresses[network], abi);
  }

  getUnderlyingPriceUSD(cToken) {
    const method = this.inner.methods.getUnderlyingPrice(cToken.address);
    return this._callerForUint256(method, x =>
      x.div(1e18).div(1e18 / cToken.decimals)
    );
  }
}

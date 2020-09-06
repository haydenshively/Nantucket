import SmartContract from './smartcontract'

// String enums allow for dynamic requiring the correct json files.
// The enum still provides type safety
export enum EthNet {
  mainnet = 'mainnet',
  ropsten = 'ropsten'
}

// This interface is intended to be implemented statically
// See https://stackoverflow.com/a/43674389
export interface MultiEthNet {
  forNet(network: EthNet): SmartContract;
}
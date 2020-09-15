const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const SmartContract = require("../smartcontract");

class CToken extends SmartContract {
  constructor(address, abi, decimalsOfUnderlying = 18) {
    super(address, abi);
    this.decimals = "1e" + decimalsOfUnderlying.toString();
  }

  /**
   * Gets the current exchange rate
   * (uUnitsSupplied() + uUnitsBorrowed() - totalReserves()) / cUnitsInCirculation()
   *
   * @return {function(provider, Number?): Promise<Big>} the exchange rate
   */
  exchangeRate() {
    const method = this._inner.methods.exchangeRateCurrent();
    return this._callerForUint256(method, x => x.div(1e18));
  }

  /**
   * Gets the current borrow rate per block
   *
   * @return {function(provider, Number?): Promise<Big>} the borrow rate
   */
  borrowRate() {
    const method = this._inner.methods.borrowRatePerBlock();
    return this._callerForUint256(method, x => x.div(1e18));
  }

  /**
   * Gets the current supply rate per block
   *
   * @return {function(provider, Number?): Promise<Big>} the supply rate
   */
  supplyRate() {
    const method = this._inner.methods.supplyRatePerBlock();
    return this._callerForUint256(method);
  }

  /**
   * Gets the total number of cTokens in circulation
   *
   * @return {function(provider, Number?): Promise<Big>} cTokens in circulation
   */
  cUnitsInCirculation() {
    const method = this._inner.methods.totalSupply();
    return this._callerForUint256(method);
  }

  /**
   * Gets the total number of uTokens supplied to Compound
   *
   * @return {function(provider, Number?): Promise<Big>} uTokens supplied
   */
  uUnitsSupplied() {
    const method = this._inner.methods.getCash();
    return this._callerForUint256(method, x => x.div(this.decimals));
  }

  /**
   * Gets the number of uTokens supplied by a given user
   *
   * @param {String} supplier address of any user
   * @return {function(provider, Number?): Promise<Big>} uTokens supplied
   */
  uUnitsSuppliedBy(supplier) {
    const method = this._inner.methods.balanceOfUnderlying(supplier);
    return this._callerForUint256(method, x => x.div(this.decimals));
  }

  /**
   * Gets the total number of uTokens borrowed from Compound
   *
   * @return {function(provider, Number?): Promise<Big>} uTokens borrowed
   */
  uUnitsBorrowed() {
    const method = this._inner.methods.totalBorrowsCurrent();
    return this._callerForUint256(method, x => x.div(this.decimals));
  }

  /**
   * Gets the number of uTokens borrowed by a given user (includes interest)
   *
   * @param {String} borrower address of any user
   * @return {function(provider, Number?): Promise<Big>} uTokens borrowed
   */
  uUnitsBorrowedBy(borrower) {
    const method = this._inner.methods.borrowBalanceCurrent(borrower);
    return this._callerForUint256(method, x => x.div(this.decimals));
  }
}

const decimals = {
  cBAT: 18,
  cDAI: 18,
  cETH: 18,
  cREP: 18,
  cSAI: 18,
  cUSDC: 6,
  cUSDT: 6,
  cWBTC: 8,
  cZRX: 18
};

const addresses = {
  mainnet: {
    cBAT: "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e",
    cDAI: "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643",
    cETH: "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
    cREP: "0x158079ee67fce2f58472a96584a73c7ab9ac95c1",
    cSAI: "0xf5dce57282a584d2746faf1593d3121fcac444dc",
    cUSDC: "0x39aa39c021dfbae8fac545936693ac917d5e7563",
    cUSDT: "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9",
    cWBTC: "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4",
    cZRX: "0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407"
  },
  ropsten: {
    cBAT: "0x9e95c0b2412ce50c37a121622308e7a6177f819d",
    cDAI: "0xdb5ed4605c11822811a39f94314fdb8f0fb59a2c",
    cETH: "0xbe839b6d93e3ea47effcca1f27841c917a8794f3",
    cREP: "0x8f2c8b147a3d316d2b98f32f3864746f034a55a2",
    cSAI: "0xc4d2a5872e16bc9e6557be8b24683d96eb6adca9",
    cUSDC: "0x8af93cae804cc220d1a608d4fa54d1b6ca5eb361",
    cUSDT: "0x135669c2dcbd63f639582b313883f101a4497f76",
    cWBTC: "0x58145bc5407d63daf226e4870beeb744c588f149",
    cZRX: "0x00e02a5200ce3d5b5743f5369deb897946c88121"
  }
};

for (let net in addresses) {
  let cTokens = {};
  for (let symbol in addresses[net]) {
    const address = addresses[net][symbol];

    cTokens[symbol] = new CToken(
      address,
      require(`../abis/${net}/compound/${symbol.toLowerCase()}.json`),
      decimals[symbol]
    );
    cTokens[address] = cTokens[symbol];
  }
  exports[net] = cTokens;
}

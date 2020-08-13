const Big = require("big.js");
Big.DP = 40;
Big.RM = 0;

const Contract = require("../smartcontract");
const CBATABI = require("../abis/compound/cbat.json");
const CDAIABI = require("../abis/compound/cdai.json");
const CETHABI = require("../abis/compound/ceth.json");
const CREPABI = require("../abis/compound/crep.json");
const CSAIABI = require("../abis/compound/csai.json");
const CUSDCABI = require("../abis/compound/cusdc.json");
const CUSDTABI = require("../abis/compound/cusdt.json");
const CWBTCABI = require("../abis/compound/cwbtc.json");
const CZRXABI = require("../abis/compound/czrx.json");

const FlashLiquidator = require("../goldenage/flashliquidator");
const PriceOracle = require("./priceoracle");

class CToken extends Contract {
  constructor(address, abi, decimalsOfUnderlying = 18, isCETH = false) {
    super(address, abi);
    this.decimals = "1e" + decimalsOfUnderlying.toString();
    this.isCETH = isCETH;
  }

  /**
   * Convenience function that calls `getUnderlyingPrice` for this cToken
   *
   * @return {Big} the token's price in Eth
   */
  priceInEth() {
    return PriceOracle.mainnet.getUnderlyingPrice(this);
  }

  /**
   * Converts ordinary asset to the cToken equivalent (SEND -- uses gas)
   * Sends `amount` uTokens and receives `amount / exchangeRate` cTokens
   *
   * @param {Number} amount how much to supply, in units of underlying
   * @param {Number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  supply_uUnits(amount, gasPrice) {
    amount = Big(amount)
      .times(this.decimals)
      .toFixed(0);
    const hexAmount = web3.utils.toHex(amount);

    if (this.isCETH) {
      const encodedMethod = this.contract.methods.mint().encodeABI();
      return this.txWithValueFor(encodedMethod, "900000", gasPrice, hexAmount);
    } else {
      const encodedMethod = this.contract.methods.mint(hexAmount).encodeABI();
      return this.txFor(encodedMethod, "900000", gasPrice);
    }
  }

  /**
   * Converts cTokens to their underlying asset (SEND -- uses gas)
   * Sends `amount` cTokens and receives `amount * exchangeRate` uTokens
   * CAUTION: `amount * exchangeRate <= accountLiquidity <= marketLiquidity`
   *
   * @param {Number} amount how much to withdraw
   * @param {Number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  withdraw_cUnits(amount, gasPrice) {
    amount = Big(amount)
      .times(1e8)
      .toFixed(0);
    const hexAmount = web3.utils.toHex(amount);
    const encodedMethod = this.contract.methods.redeem(hexAmount).encodeABI();

    return this.txFor(encodedMethod, "900000", gasPrice);
  }

  /**
   * Converts cTokens to their underlying asset (SEND -- uses gas)
   * Sends `amount` cTokens and receives `amount * exchangeRate` uTokens
   * CAUTION: `amount * exchangeRate <= accountLiquidity <= marketLiquidity`
   *
   * @param {Number} amount how much to withdraw, in units of underlying
   * @param {Number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  withdraw_uUnits(amount, gasPrice) {
    amount = Big(amount)
      .times(this.decimals)
      .toFixed(0);
    const hexAmount = web3.utils.toHex(amount);
    const encodedMethod = this.contract.methods
      .redeemUnderlying(hexAmount)
      .encodeABI();

    return this.txFor(encodedMethod, "900000", gasPrice);
  }

  /**
   * Performs liquidation (SEND -- uses gas)
   *
   * @param {String} borrower address of any user with negative account liquidity
   * @param {Number} amount the amount of debt to repay, in units of underlying
   * @param {String} cTokenToSeize an address of a cToken that the borrower holds as collateral
   * @param {Number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  liquidate_uUnits(borrower, amount, cTokenToSeize, gasPrice) {
    amount = Big(amount)
      .times(this.decimals)
      .toFixed(0);
    const hexAmount = web3.utils.toHex(amount);

    if (this.isCETH) {
      const encodedMethod = this.contract.methods
        .liquidateBorrow(borrower, cTokenToSeize)
        .encodeABI();
      return this.txWithValueFor(encodedMethod, "700000", gasPrice, hexAmount);
    } else {
      const encodedMethod = this.contract.methods
        .liquidateBorrow(borrower, hexAmount, cTokenToSeize)
        .encodeABI();
      return this.txFor(encodedMethod, "700000", gasPrice);
    }
  }

  /**
   * Convenience function that calls the `liquidate` function of FlashLiquidator
   *
   * @param {String} borrower address of any user with negative account liquidity
   * @param {Number} amount the amount of debt to repay, in units of underlying
   * @param {String} cTokenToSeize an address of a cToken that the borrower holds as collateral
   * @param {Number} gasPrice the gas price to use, in gwei
   * @return {Object} the transaction object
   */
  flashLiquidate_uUnits(borrower, amount, cTokenToSeize, gasPrice) {
    return FlashLiquidator.mainnet.liquidate(
      borrower,
      this.address,
      cTokenToSeize,
      Big(amount).times(this.decimals),
      gasPrice
    );
  }

  /**
   * Gets the current exchange rate
   * (uUnitsSupplied() + uUnitsBorrowed() - totalReserves()) / cUnitsInCirculation()
   *
   * @return {Big} the exchange rate
   */
  async exchangeRate() {
    return Big(await this.contract.methods.exchangeRateCurrent().call());
  }

  /**
   * Gets the current borrow rate per block
   *
   * @return {Big} the borrow rate
   */
  async borrowRate() {
    return Big(await this.contract.methods.borrowRatePerBlock().call());
  }

  /**
   * Gets the current supply rate per block
   *
   * @return {Big} the supply rate
   */
  async supplyRate() {
    return Big(await this.contract.methods.supplyRatePerBlock().call());
  }

  /**
   * Gets the total number of cTokens in circulation
   *
   * @return {Big} cTokens in circulation
   */
  async cUnitsInCirculation() {
    return Big(await this.contract.methods.totalSupply().call());
  }

  /**
   * Gets the total number of uTokens supplied to Compound
   *
   * @return {Big} uTokens supplied
   */
  async uUnitsSupplied() {
    return Big(await this.contract.methods.getCash().call()).div(this.decimals);
  }

  /**
   * Gets the number of uTokens supplied by a given user
   *
   * @param {String} supplier address of any user
   */
  async uUnitsSuppliedBy(supplier) {
    return Big(
      await this.contract.methods.balanceOfUnderlying(supplier).call()
    ).div(this.decimals);
  }

  /**
   * Gets the total number of uTokens borrowed from Compound
   *
   * @return {Big} uTokens borrowed
   */
  async uUnitsBorrowed() {
    return Big(await this.contract.methods.totalBorrowsCurrent().call()).div(
      this.decimals
    );
  }

  /**
   * Gets the number of uTokens borrowed by a given user (includes interest)
   * 
   * @param {String} borrower address of any user
   */
  async uUnitsBorrowedBy(borrower) {
    return Big(
      await this.contract.methods.borrowBalanceCurrent(borrower).call()
    ).div(this.decimals);
  }
}

exports.CToken = CToken;
exports.mainnet = {
  cBAT: new CToken("0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e", CBATABI),
  cDAI: new CToken("0x5d3a536e4d6dbd6114cc1ead35777bab948e3643", CDAIABI),
  cETH: new CToken(
    "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5",
    CETHABI,
    18,
    true
  ),
  cREP: new CToken("0x158079ee67fce2f58472a96584a73c7ab9ac95c1", CREPABI),
  cSAI: new CToken("0xf5dce57282a584d2746faf1593d3121fcac444dc", CSAIABI),
  cUSDC: new CToken("0x39aa39c021dfbae8fac545936693ac917d5e7563", CUSDCABI, 6),
  cUSDT: new CToken("0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9", CUSDTABI, 6),
  cWBTC: new CToken("0xc11b1268c1a384e55c48c2391d8d480264a3a7f4", CWBTCABI, 8),
  cZRX: new CToken("0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407", CZRXABI)
};
exports.mainnetByAddr = {
  "0x6c8c6b02e7b2be14d4fa6022dfd6d75921d90e4e": exports.mainnet.cBAT,
  "0x5d3a536e4d6dbd6114cc1ead35777bab948e3643": exports.mainnet.cDAI,
  "0x4ddc2d193948926d02f9b1fe9e1daa0718270ed5": exports.mainnet.cETH,
  "0x158079ee67fce2f58472a96584a73c7ab9ac95c1": exports.mainnet.cREP,
  "0xf5dce57282a584d2746faf1593d3121fcac444dc": exports.mainnet.cSAI,
  "0x39aa39c021dfbae8fac545936693ac917d5e7563": exports.mainnet.cUSDC,
  "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9": exports.mainnet.cUSDT,
  "0xc11b1268c1a384e55c48c2391d8d480264a3a7f4": exports.mainnet.cWBTC,
  "0xb3319f5d18bc0d84dd1b4825dcde5d5f7266d407": exports.mainnet.cZRX
};

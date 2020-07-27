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

class CToken extends Contract {
  constructor(address, abi, decimalsOfUnderlying = 18, isCETH = false) {
    super(address, abi);
    this.decimals = "1e" + decimalsOfUnderlying.toString();
    this.isCETH = isCETH;
  }

  // Converts ordinary asset to the cToken equivalent (SEND -- uses gas)
  // amount: #tokens
  // result: sends (#tokens) and receives (#ctokens = #tokens / exchange_rate)
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

  // Converts the cToken to its ordinary asset equivalent (SEND -- uses gas)
  // amount: #ctokens
  // result: sends (#ctokens) and receives (#tokens <= #ctokens * exchange_rate)
  // CAUTION: #tokens <= #ctokens * exchange_rate <= account_liquidity <= market_liquidity
  withdraw_cUnits(amount, gasPrice) {
    amount = Big(amount)
      .times(1e8)
      .toFixed(0);
    const hexAmount = web3.utils.toHex(amount);
    const encodedMethod = this.contract.methods.redeem(hexAmount).encodeABI();

    return this.txFor(encodedMethod, "900000", gasPrice);
  }

  // Just like withdraw_cUnits, but amount is in units of the ordinary asset (SEND -- uses gas)
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

  // Performs liquidation (SEND -- uses gas)
  // borrower: account address of any user with negative account_liquidity
  // amount: the amount of debt to repay, in units of the ordinary asset
  // cTokenToSeize: an address of a cToken that the borrower holds as collateral
  // result: funds will be withdrawn from your wallet in order to pay debt
  liquidate_uUnits(borrower, amount, cTokenToSeize, gasPrice) {
    amount = Big(amount)
      .times(this.decimals)
      .toFixed(0);
    const hexAmount = web3.utils.toHex(amount);

    if (this.isCETH) {
      const encodedMethod = this.contract.methods
        .liquidateBorrow(borrower, cTokenToSeize)
        .encodeABI();
      return this.txWithValueFor(encodedMethod, "900000", gasPrice, hexAmount);
    } else {
      const encodedMethod = this.contract.methods
        .liquidateBorrow(borrower, hexAmount, cTokenToSeize)
        .encodeABI();
      return this.txFor(encodedMethod, "900000", gasPrice);
    }
  }

  flashLiquidate_uUnits(borrower, amount, cTokenToSeize, gasPrice) {
    return FlashLiquidator.mainnet.liquidate(
      borrower,
      this.address,
      cTokenToSeize,
      Big(amount).times(this.decimals),
      gasPrice
    );
  }

  // Returns the current exchange_rate (CALL -- no gas needed)
  // exchange_rate = (uUnitsInContract() + uUnitsLoanedOut() - totalReserves()) / cUnitsInCirculation()
  async exchangeRate() {
    return Big(await this.contract.methods.exchangeRateCurrent().call());
  }

  // Returns the current borrow rate per block (CALL -- no gas needed)
  async borrowRate() {
    return Big(await this.contract.methods.borrowRatePerBlock().call());
  }

  // Returns the current supply rate per block (CALL -- no gas needed)
  async supplyRate() {
    return Big(await this.contract.methods.supplyRatePerBlock().call());
  }

  // Returns the total amount of cTokens currently in circulation (CALL -- no gas needed)
  async cUnitsInCirculation() {
    return Big(await this.contract.methods.totalSupply().call());
  }

  // Returns the total amount of ordinary asset that the contract owns (CALL -- no gas needed)
  async uUnitsSupplied() {
    return Big(await this.contract.methods.getCash().call()).div(this.decimals);
  }

  // Returns the amount of ordinary asset that the wallet has placed in the contract (CALL -- no gas needed)
  async uUnitsSuppliedBy(wallet) {
    return Big(
      await this.contract.methods.balanceOfUnderlying(wallet).call()
    ).div(this.decimals);
  }

  // Returns the total amount of ordinary asset that the contract has loaned out (CALL -- no gas needed)
  async uUnitsBorrowed() {
    return Big(await this.contract.methods.totalBorrowsCurrent().call()).div(
      this.decimals
    );
  }

  // Returns the amount of ordinary asset that the contract has loaned out to borrower (CALL -- no gas needed)
  // ** includes interest **
  // borrower: account address of any user
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

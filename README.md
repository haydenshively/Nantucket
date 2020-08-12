# Nantucket

![Node.js CI](https://github.com/haydenshively/nantucket/workflows/Node.js%20CI/badge.svg)

## Introduction

Compound is both a company and a collection of code (a decentralized app or "Dapp") that's stored on the Ethereum blockchain. The Dapp allows users to supply and
borrow crypto tokens (e.g. WBTC, USDC, DAI, BAT). Suppliers earn interest, while borrowers pay interest.

But this system doesn't work like a regular bank -- there's no way to identify individuals on the blockchain, so there's no way of knowing their creditworthiness. As such, in order to borrow anything, users must first put up **collateral that exceeds the value of their desired loan** (if we get more technical, each crypto
token has a "collateral factor" that indicates the % of collateral that a user can borrow). For example, suppose Bob believes that Bitcoin's price will fall soon.
Bob can supply USDC to Compound, borrow an amount of Bitcoin worth less than `collateralFactor * valueOfSuppliedUSDC`, and trade that borrowed Bitcoin for more
USDC. If Bob's belief comes true, he'll be able to re-trade the USDC for Bitcoin and pay off his loan with some USDC left over.

If, on the other hand, Bob is wrong -- the price of Bitcoin rises -- then Bob is in trouble. In this situation, the value of his borrowed Bitcoin may grow to exceed
the `collateralFactor * valueOfSuppliedUSDC`. If Bob fails to pay off his loan before this happens, then Bob is subject to liquidation.

## Liquidation

```js
let collatValue = 0.0;
let borrowValue = 0.0;

for (let cryptoToken of user.cryptoTokens) {
  // Note that each crypto token can have a unique collateral factor
  collatValue += user.walletSize[cryptoToken] * cryptoToken.priceInUSDollars * cryptoToken.collateralFactor;
  borrowValue += user.loanSize[cryptoToken] * cryptoToken.priceInUSDollars;
}

const userIsLiquidatable = borrowValue > collatValue;
```

The pseudocode above shows how Compound determines if a user is liquidatable or not. If they are liquidatable, the next question is "By how much?" The number that governs this is called the "close factor," and so far has been constant at 50%. This means that `liquidatableAmount <= borrowValue * 0.50`, but it's not the only constraint...

If successful, liquidators receive a portion of the user's collateral: `revenue = liquidatableAmount * liquidationIncentive`, where the liquidation incentive is usually around 110%. In order for this to work, the user must actually have that much collateral available for the taking. This means that
`liquidatableAmount <= collatValue * liquidationIncentive`.

Both constraints must be satisfied for the liquidation to be successful. There are other things to consider as well, such as "Which loan should I pay off?" (if the
user has borrowed multiple types of crypto tokens) and "Which collateral should I seize?" (if the user has supplied multiple types of crypto tokens). To complicate
things further, DAI and USDT can be both repaid and seized in a single liquidation, but normally `repayTokenType != seizeTokenType`.

You can find most of this liquidation logic [here](./src/database/tableusers.js) and [here](./src/candidate.js).

## Flash Loans

A flash loan is an atomic interaction (a single transaction on the blockchain) that (1) takes out a loan and (2) pays it off. Only certain Dapps allow this (e.g.
AAVE, UniswapV2, and DyDx). What's great is that you can take out a loan of any size without first putting up collateral. If you fail to pay off your debt by the
end of the transaction, the provider's software (AAVE, etc.) simply throws an error and the whole transaction is undone. The only penalty is the transaction fee
(gas * gasPrice).

Nantucket uses AAVE flash loans to liquidate users on Compound:
1. Borrow X tokens of type A from AAVE
2. Liquidate user on Compound by paying off their debt with X tokens of type A
3. As a reward, receive Y tokens of type B from Compound, seized from the user's collateral (where `Y = X * liquidationIncentive`). Note that type A and B can be
the same for DAI and USDT, but must be different otherwise
4. Trade Y tokens of type B for Z tokens of type A on Uniswap. Assuming Uniswap's exchange rates aren't whack, Z should be greater than X.
5. Repay AAVE loan using X tokens of type A. Technically AAVE also expects a small fee (0.0009%).
6. Keep `Z - X` tokens of type A as profit.

This logic can be found in the [contracts folder](./contracts).


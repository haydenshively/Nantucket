// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

interface PriceOracle {
    function getUnderlyingPrice(address cToken) external view returns (uint);
}

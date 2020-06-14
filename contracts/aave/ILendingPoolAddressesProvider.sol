// SPDX-License-Identifier: GNU
pragma solidity ^0.6.6;

/**
    @title ILendingPoolAddressesProvider interface
    @notice Provides the interface to fetch the LendingPoolCore address
    @author AAVE
 */

interface ILendingPoolAddressesProvider {
    function getLendingPoolCore() external view returns (address payable);
    function getLendingPool() external view returns (address);
}

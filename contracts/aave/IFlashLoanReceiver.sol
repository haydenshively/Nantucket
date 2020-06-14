// SPDX-License-Identifier: GNU
pragma solidity ^0.6.6;

/**
    @title IFlashLoanReceiver interface
    @notice Interface for the AAVE fee IFlashLoanReceiver.
    @author AAVE
 */

interface IFlashLoanReceiver {
    function executeOperation(address _reserve, uint256 _amount, uint256 _fee, bytes calldata _params) external;
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.8;

// Import base Initializable contract
import "@openzeppelin/upgrades/contracts/Initializable.sol";

// Import the IERC20 interface and and SafeMath library
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";


contract Counter {
  uint256 public value;

  function increase(uint256 amount) public {
    value += amount;
  }
}
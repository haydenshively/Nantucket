// SPDX-License-Identifier: GPL
pragma solidity ^0.6.10;

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint value) external returns (bool);
    function withdraw(uint) external;
}

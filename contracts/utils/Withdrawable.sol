// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

import "@openzeppelin/contracts-ethereum-package/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";

/**
    Ensures that any contract that inherits from this contract is able to
    withdraw funds that are accidentally received or stuck.
 */

abstract contract Withdrawable is OwnableUpgradeSafe {
    using SafeERC20 for ERC20UpgradeSafe;
    address constant ETHER = address(0);

    event LogWithdraw(
        address indexed _from,
        address indexed _assetAddress,
        uint amount
    );

    /**
     * @dev Withdraw asset.
     * @param _assetAddress Asset to be withdrawn.
     */
    function withdraw(address _assetAddress) public onlyOwner {
        uint assetBalance;
        if (_assetAddress == ETHER) {
            address self = address(this); // workaround for a possible solidity bug
            assetBalance = self.balance;
            msg.sender.transfer(assetBalance);
        } else {
            assetBalance = ERC20UpgradeSafe(_assetAddress).balanceOf(address(this));
            ERC20UpgradeSafe(_assetAddress).safeTransfer(msg.sender, assetBalance);
        }
        emit LogWithdraw(msg.sender, _assetAddress, assetBalance);
    }
}

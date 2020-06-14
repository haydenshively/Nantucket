// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.6;

// Import AAVE components
import "./aave/FlashLoanReceiverBase.sol";
import "./aave/ILendingPoolAddressesProvider.sol";
import "./aave/ILendingPool.sol";

// Import Compound components
import "./compound/CErc20.sol";
import "./compound/CEther.sol";
import "./compound/Comptroller.sol";

contract Flashloan is FlashLoanReceiverBase {

    // Comptroller troll;

    // Initializer function (replaces constructor)
    function initialize(address _addressProvider) public override initializer {
        super.initialize(_addressProvider);
        // troll = Comptroller(_comptrollerAddress);
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(address _reserve, uint256 _amount, uint256 _fee, bytes calldata _params) external override {

        require(_amount <= getBalanceInternal(address(this), _reserve), "Invalid balance, was the flashLoan successful?");

        (address asset, address borrower, address collateral) = abi.decode(_params, (address, address, address));
        if (asset == 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5) {
            CEther cEther = CEther(asset);
            cEther.liquidateBorrow{value: _amount}(borrower, collateral);
        }else {
            CErc20 cErc20 = CErc20(asset);
            cErc20.liquidateBorrow(borrower, _amount, collateral);
        }

        uint totalDebt = _amount.add(_fee);
        transferFundsBackToPoolInternal(_reserve, totalDebt);
    }

    // /**
    //     Flash loan 1000000000000000000 wei (1 ether) worth of `_asset`
    //  */
    // function flashloan(address _asset) public onlyOwner {
    //     bytes memory data = "";
    //     uint amount = 1 ether;

    //     ILendingPool lendingPool = ILendingPool(addressesProvider.getLendingPool());
    //     lendingPool.flashLoan(address(this), _asset, amount, data);
    // }

    function liquidate(address asset, address borrower, uint repayAmount, address collateral) public {
        bytes memory params = abi.encode(asset, borrower, collateral);

        ILendingPool lendingPool = ILendingPool(addressesProvider.getLendingPool());
        lendingPool.flashLoan(address(this), asset, repayAmount, params);
    }

    // function liquidate(address borrower) {

    // }
}

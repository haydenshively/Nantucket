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

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address constant ETHER = address(0);
    address constant CETH = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;
    address payable private wallet;

    event LogWithdraw(
        address indexed _assetAddress,
        uint amount
    );

    // Initializer function (replaces constructor)
    function initialize(address payable _wallet, address _addressProvider) public initializer {
        super.initialize(_addressProvider);
        wallet = _wallet;
    }

    // function liquidate(address _borrower) {
        
    // }

    function liquidate(address _borrower, address _borrowedCToken, address _collatCToken, uint256 _amount) internal {
        address requisiteAsset;
        if (_borrowedCToken == CETH) {
            requisiteAsset = ethAddress;
        }else {
            requisiteAsset = CErc20Storage(_borrowedCToken).underlying();
        }

        bytes memory params = abi.encode(_borrowedCToken, _borrower, _collatCToken);

        ILendingPool lendingPool = ILendingPool(addressesProvider.getLendingPool());
        lendingPool.flashLoan(address(this), requisiteAsset, _amount, params);
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(address _reserve, uint256 _amount, uint256 _fee, bytes calldata _params) external override {

        require(_amount <= getBalanceInternal(address(this), _reserve), "Invalid balance, was the flashLoan successful?");

        (address borrowedCToken, address borrower, address collatCToken) = abi.decode(_params, (address, address, address));
        
        if (borrowedCToken == CETH) {
            CEther cEther = CEther(borrowedCToken);
            cEther.liquidateBorrow{value: _amount}(borrower, collatCToken);
        }else {
            CErc20 cErc20 = CErc20(borrowedCToken);
            cErc20.liquidateBorrow(borrower, _amount, collatCToken);
        }

        uint totalDebt = _amount.add(_fee);
        transferFundsBackToPoolInternal(_reserve, totalDebt);
    }

    /**
     * @dev Withdraw asset.
     * @param _assetAddress Asset to be withdrawn.
     */
    function withdraw(address _assetAddress) public {
        uint assetBalance;
        if (_assetAddress == ETHER) {
            address self = address(this); // workaround for a possible solidity bug
            assetBalance = self.balance;
            wallet.transfer(assetBalance);
        } else {
            assetBalance = IERC20(_assetAddress).balanceOf(address(this));
            IERC20(_assetAddress).safeTransfer(wallet, assetBalance);
        }
        emit LogWithdraw(_assetAddress, assetBalance);
    }
}

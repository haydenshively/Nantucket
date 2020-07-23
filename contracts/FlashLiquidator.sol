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

// Import Uniswap components
import '@uniswap/lib/contracts/libraries/TransferHelper.sol';
import "./uniswap/IUniswapV2Router02.sol";


contract FlashLiquidator is FlashLoanReceiverBase {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address constant ETHER = address(0);
    address constant CETH = 0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5;
    address payable private wallet;
    IUniswapV2Router02 public router;

    event LogWithdraw(
        address indexed _assetAddress,
        uint amount
    );

    constructor(address payable _wallet, address _addressProvider, address _uniswapRouter) FlashLoanReceiverBase(_addressProvider) public {
        wallet = _wallet;
        router = IUniswapV2Router02(_uniswapRouter);
    }

    function aaveReserveFor(address _cToken) internal view returns (address) {
        return (_cToken == CETH) ? AETH : CErc20Storage(_cToken).underlying();
    }

    function approve(address _sender, address _receiver, uint256 _amount) internal {
        IERC20(_sender).safeApprove(_receiver, _amount);
    }

    function liquidate(address _borrower, address _borrowedCToken, address _collatCToken, uint256 _amount) public {
        /** Liquidate a Compound user with a flash loan

        Args:
            _borrower (address): The Compound user to liquidate
            _borrowedCToken (address): A CToken for which the user is in debt
            _collatCToken (address): A CToken for which the user has a supply balance
            _amount (uint256): The amount (specified in units of _borrowedCToken.underlying) to flash loan and pay off

        Returns:
            None
        */

        // Save parameters so that they can be passed through to the flash loan `executeOperation` function
        // NOTE: _amount is passed through automatically
        bytes memory params = abi.encode(_borrowedCToken, _borrower, _collatCToken);

        // Retrieve the AAVE lending pool and request a flash loan
        ILendingPool lendingPool = ILendingPool(addressesProvider.getLendingPool());
        lendingPool.flashLoan(address(this), aaveReserveFor(_borrowedCToken), _amount, params);

        // Send profits to wallet
        withdraw((_collatCToken == CETH) ? ETHER : CErc20Storage(_collatCToken).underlying());
    }

    /**
        This function is called after your contract has received the flash loaned amount
     */
    function executeOperation(address _reserve, uint256 _amount, uint256 _fee, bytes calldata _params) external override {
        require(_amount <= getBalanceInternal(address(this), _reserve), "Balance too low, flash loan must have failed.");
        // Compute the totalDebt that must be paid back for the transaction to go through
        uint totalDebt = _amount.add(_fee);

        // Unpack parameters sent from the `liquidate` function
        // NOTE: these are being passed in from some other contract, and cannot necessarily be trusted
        // TODO: find a way to trust them, use private instance vars instead, or make sure they can't do harm
        (address borrowedCToken, address borrower, address collatCToken) = abi.decode(_params, (address, address, address));
        
        if (borrowedCToken == CETH) {
            // Assuming the flash loan was (1) successful and (2) initiated by the `liquidate` function,
            // we should have `_amount` of ETH. This should match `_reserve`.
            require(AETH == _reserve, "Flash loan obtained the wrong token");
            // Perform the liquidation. If all goes well, we receive an amount of collatCTokens
            // equivalent to the amount we repaid, multiplied by the liquidation incentive.
            CEther(borrowedCToken).liquidateBorrow{value: _amount}(borrower, collatCToken);

            // Convert newly-earned collatCTokens into their underlying asset (which may be ETH)
            uint256 reward_cUnits = IERC20(collatCToken).balanceOf(address(this));
            uint256 reward_uUnits;
            if (collatCToken == CETH) {
                reward_uUnits = CEther(collatCToken).balanceOfUnderlying(address(this));
                require(CEther(collatCToken).redeem(reward_cUnits) == 0, "Unable to redeem collateral reward.");
            }else {
                reward_uUnits = CErc20(collatCToken).balanceOfUnderlying(address(this));
                require(CErc20(collatCToken).redeem(reward_cUnits) == 0, "Unable to redeem collateral reward.");

                // MARK: - Begin UniswapV2 asset swap (to pay back flash loan in original units)
                // Set deadline for swap transaction, which shouldn't matter since it's atomic.
                uint256 deadline = now + 1 minutes;
                // Figure out what token corresponds to reward_uUnits.
                // Then tell the router it's approved to swap that amount.
                address collatToken = CErc20Storage(collatCToken).underlying();
                TransferHelper.safeApprove(collatToken, address(router), reward_uUnits);

                // Define swapping path
                address[] memory path = new address[](2);
                path[0] = collatToken;
                path[1] = router.WETH();
                //                           desired,   amount traded, path, recipient,     deadline
                router.swapTokensForExactETH(totalDebt, reward_uUnits, path, address(this), deadline);
                // Now that we're done, remove router's allowance
                TransferHelper.safeApprove(collatToken, address(router), 0);
            }

        }else {
            // Assuming the flash loan was (1) successful and (2) initiated by the `liquidate` function,
            // we should have `_amount` of borrowedCToken.underlying. This should match `_reserve`.
            address borrowedToken = CErc20Storage(borrowedCToken).underlying();
            require(borrowedToken == _reserve, "Flash loan obtained the wrong token");
            // The borrower took out a loan from CToken contract X. Before we can liquidate them,
            // we must approve contract X to take our money.
            approve(borrowedToken, borrowedCToken, _amount);
            // Perform the liquidation. If all goes well, we receive an amount of collatCTokens
            // equivalent to the amount we repaid, multiplied by the liquidation incentive.
            CErc20(borrowedCToken).liquidateBorrow(borrower, _amount, collatCToken);
            // Now that we're done, remove borrowedToken's allowance
            approve(borrowedToken, borrowedCToken, 0);

            // Convert newly-earned collatCTokens into their underlying asset (which may be ETH)
            uint256 reward_cUnits = IERC20(collatCToken).balanceOf(address(this));
            uint256 reward_uUnits;
            if (collatCToken == CETH) {
                reward_uUnits = CEther(collatCToken).balanceOfUnderlying(address(this));
                require(CEther(collatCToken).redeem(reward_cUnits) == 0, "Unable to redeem collateral reward.");
            }else {
                reward_uUnits = CErc20(collatCToken).balanceOfUnderlying(address(this));
                require(CErc20(collatCToken).redeem(reward_cUnits) == 0, "Unable to redeem collateral reward.");
            }

            if (collatCToken != borrowedCToken) {
                // MARK: - Begin UniswapV2 asset swap (to pay back flash loan in original units)
                // Set deadline for swap transaction, which shouldn't matter since it's atomic.
                uint256 deadline = now + 1 minutes;
                if (collatCToken == CETH) {
                    // In this case, we know that reward_uUnits is in ETH. UniswapV2 uses WETH, so the path
                    // must begin with that. Then, we simply convert to the original loan token
                    address[] memory path = new address[](2);
                    path[0] = router.WETH();
                    path[1] = borrowedToken;// equivalent to `_reserve`
                    //                                  amount traded, desired,   path, recipient,     deadline
                    router.swapETHForExactTokens{value: reward_uUnits}(totalDebt, path, address(this), deadline);
                }else {
                    // In this case, we have to figure out what token corresponds to reward_uUnits.
                    // Then we tell the router it's approved to swap that amount.
                    address collatToken = CErc20Storage(collatCToken).underlying();
                    TransferHelper.safeApprove(collatToken, address(router), reward_uUnits);
                    // Define swapping path
                    address[] memory path = new address[](3);
                    path[0] = collatToken;
                    path[1] = router.WETH();
                    path[2] = borrowedToken;
                    //                              desired,   amount traded, path, recipient,     deadline
                    router.swapTokensForExactTokens(totalDebt, reward_uUnits, path, address(this), deadline);
                    // Now that we're done, remove router's allowance
                    TransferHelper.safeApprove(collatToken, address(router), 0);
                }
            }
        }

        transferFundsBackToPoolInternal(_reserve, totalDebt);
    }

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

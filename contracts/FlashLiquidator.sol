// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.6.10;
// For PriceOracle postPrices()
pragma experimental ABIEncoderV2;

// Import AAVE components
import "./aave/FlashLoanReceiverBase.sol";
import "./aave/ILendingPoolAddressesProvider.sol";
import "./aave/ILendingPool.sol";

// Import Compound components
import "./compound/CErc20.sol";
import "./compound/CEther.sol";
import "./compound/Comptroller.sol";
import "./compound/PriceOracle.sol";

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
    Comptroller public comptroller;
    PriceOracle public priceOracle;

    event LogWithdraw(
        address indexed _assetAddress,
        uint amount
    );

    constructor(address payable _wallet, address _addressProvider) FlashLoanReceiverBase(_addressProvider) public {
        wallet = _wallet;
        router = IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
        comptroller = Comptroller(0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B);
        priceOracle = PriceOracle(0x9B8Eb8b3d6e2e0Db36F41455185FEF7049a35CaE);
    }

    function aaveReserveFor(address _cToken) internal view returns (address) {
        return (_cToken == CETH) ? AETH : CErc20Storage(_cToken).underlying();
    }

    function approve(address _sender, address _receiver, uint256 _amount) internal {
        IERC20(_sender).safeApprove(_receiver, _amount);
    }

    function liquidateManyWithPriceUpdate(
        bytes[] calldata _messages,
        bytes[] calldata _signatures,
        string[] calldata _symbols,
        address[] calldata _borrowers,
        address[] calldata _cTokens
    ) public {
        priceOracle.postPrices(_messages, _signatures, _symbols);
        liquidateMany(_borrowers, _cTokens);
    }

    function liquidateMany(address[] calldata _borrowers, address[] calldata _cTokens) public {
        uint256 closeFact = comptroller.closeFactorMantissa();
        uint256 liqIncent = comptroller.liquidationIncentiveMantissa();

        for (uint8 i = 0; i < _borrowers.length; i++) {
            address borrower = _borrowers[i];
            ( , uint256 liquidity, ) = comptroller.getAccountLiquidity(borrower);
            if (liquidity > 0) continue;
            address repayCToken = _cTokens[i * 2];
            address seizeCToken = _cTokens[i * 2 + 1];

            uint256 uPriceRepay = priceOracle.getUnderlyingPrice(repayCToken);
            uint256 uPriceSeize = priceOracle.getUnderlyingPrice(seizeCToken);

            // uint256(10**18) adjustments ensure that all place values are dedicated
            // to repay and seize precision rather than unnecessary closeFact and liqIncent decimals
            uint256 repayMax = CErc20(repayCToken).borrowBalanceCurrent(borrower) * closeFact / uint256(10**18);
            uint256 seizeMax = CErc20(seizeCToken).balanceOfUnderlying(borrower) * uint256(10**18) / liqIncent;

            uint256 repayMax_Eth = repayMax * uPriceRepay;
            uint256 seizeMax_Eth = seizeMax * uPriceSeize;

            uint256 repay_Eth = (repayMax_Eth < seizeMax_Eth) ? repayMax_Eth : seizeMax_Eth;
            uint256 repay = repay_Eth / uPriceRepay;

            liquidate(borrower, repayCToken, seizeCToken, repay);
            if (gasleft() < 2300000) break;
        }
    }

    function liquidate(address _borrower, address _repayCToken, address _seizeCToken, uint256 _amount) public {
        /** Liquidate a Compound user with a flash loan

        Args:
            _borrower (address): The Compound user to liquidate
            _repayCToken (address): A CToken for which the user is in debt
            _seizeCToken (address): A CToken for which the user has a supply balance
            _amount (uint256): The amount (specified in units of _repayCToken.underlying) to flash loan and pay off

        Returns:
            None
        */

        // Save parameters so that they can be passed through to the flash loan `executeOperation` function
        // NOTE: _amount is passed through automatically
        bytes memory params = abi.encode(_repayCToken, _borrower, _seizeCToken);

        // Retrieve the AAVE lending pool and request a flash loan
        ILendingPool lendingPool = ILendingPool(addressesProvider.getLendingPool());
        lendingPool.flashLoan(address(this), aaveReserveFor(_repayCToken), _amount, params);

        // Send profits to wallet
        withdraw((_seizeCToken == CETH) ? ETHER : CErc20Storage(_seizeCToken).underlying());
    }

    function executeOperation(address _reserve, uint256 _amount, uint256 _fee, bytes calldata _params) external override {
        /** This function is called after your contract has received the flash loaned amount
        */

        require(_amount <= getBalanceInternal(address(this), _reserve), "Balance too low, flash loan must have failed.");
        // Compute the totalDebt that must be paid back for the transaction to go through
        uint totalDebt = _amount.add(_fee);

        // Unpack parameters sent from the `liquidate` function
        // NOTE: these are being passed in from some other contract, and cannot necessarily be trusted
        (address repayCToken, address borrower, address seizeCToken) = abi.decode(_params, (address, address, address));
        
        if (repayCToken == CETH) {
            // Assuming the flash loan was (1) successful and (2) initiated by the `liquidate` function,
            // we should have `_amount` of ETH. This should match `_reserve`.
            require(AETH == _reserve, "Flash loan obtained the wrong token");
            // Perform the liquidation. If all goes well, we receive an amount of seizeCTokens
            // equivalent to the amount we repaid, multiplied by the liquidation incentive.
            CEther(repayCToken).liquidateBorrow{value: _amount}(borrower, seizeCToken);

            // Convert newly-earned seizeCTokens into their underlying asset (which may be ETH)
            uint256 reward_cUnits = IERC20(seizeCToken).balanceOf(address(this));
            uint256 reward_uUnits;
            if (seizeCToken == CETH) {
                reward_uUnits = CEther(seizeCToken).balanceOfUnderlying(address(this));
                require(CEther(seizeCToken).redeem(reward_cUnits) == 0, "Unable to redeem collateral reward.");
            }else {
                reward_uUnits = CErc20(seizeCToken).balanceOfUnderlying(address(this));
                require(CErc20(seizeCToken).redeem(reward_cUnits) == 0, "Unable to redeem collateral reward.");

                // MARK: - Begin UniswapV2 asset swap (to pay back flash loan in original units)
                // Set deadline for swap transaction, which shouldn't matter since it's atomic.
                uint256 deadline = now + 1 minutes;
                // Figure out what token corresponds to reward_uUnits.
                // Then tell the router it's approved to swap that amount.
                address collatToken = CErc20Storage(seizeCToken).underlying();
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
            // we should have `_amount` of repayCToken.underlying. This should match `_reserve`.
            address repayToken = CErc20Storage(repayCToken).underlying();
            require(repayToken == _reserve, "Flash loan obtained the wrong token");
            // The borrower took out a loan from CToken contract X. Before we can liquidate them,
            // we must approve contract X to take our money.
            approve(repayToken, repayCToken, _amount);
            // Perform the liquidation. If all goes well, we receive an amount of seizeCTokens
            // equivalent to the amount we repaid, multiplied by the liquidation incentive.
            CErc20(repayCToken).liquidateBorrow(borrower, _amount, seizeCToken);
            // Now that we're done, remove repayToken's allowance
            approve(repayToken, repayCToken, 0);

            // Convert newly-earned seizeCTokens into their underlying asset (which may be ETH)
            uint256 reward_cUnits = IERC20(seizeCToken).balanceOf(address(this));
            uint256 reward_uUnits;
            if (seizeCToken == CETH) {
                reward_uUnits = CEther(seizeCToken).balanceOfUnderlying(address(this));
                require(CEther(seizeCToken).redeem(reward_cUnits) == 0, "Unable to redeem collateral reward.");
            }else {
                reward_uUnits = CErc20(seizeCToken).balanceOfUnderlying(address(this));
                require(CErc20(seizeCToken).redeem(reward_cUnits) == 0, "Unable to redeem collateral reward.");
            }

            if (seizeCToken != repayCToken) {
                // MARK: - Begin UniswapV2 asset swap (to pay back flash loan in original units)
                // Set deadline for swap transaction, which shouldn't matter since it's atomic.
                uint256 deadline = now + 1 minutes;
                if (seizeCToken == CETH) {
                    // In this case, we know that reward_uUnits is in ETH. UniswapV2 uses WETH, so the path
                    // must begin with that. Then, we simply convert to the original loan token
                    address[] memory path = new address[](2);
                    path[0] = router.WETH();
                    path[1] = repayToken;// equivalent to `_reserve`
                    //                                  amount traded, desired,   path, recipient,     deadline
                    router.swapETHForExactTokens{value: reward_uUnits}(totalDebt, path, address(this), deadline);
                }else {
                    // In this case, we have to figure out what token corresponds to reward_uUnits.
                    // Then we tell the router it's approved to swap that amount.
                    address collatToken = CErc20Storage(seizeCToken).underlying();
                    TransferHelper.safeApprove(collatToken, address(router), reward_uUnits);
                    // Define swapping path
                    address[] memory path = new address[](3);
                    path[0] = collatToken;
                    path[1] = router.WETH();
                    path[2] = repayToken;
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

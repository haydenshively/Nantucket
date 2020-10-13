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
import './uniswap/UniswapV2Library.sol';
import "./uniswap/IUniswapV2Factory.sol";
import "./uniswap/IUniswapV2Router02.sol";
import "./uniswap/IUniswapV2Callee.sol";
import "./uniswap/IUniswapV2Pair.sol";
import "./uniswap/IWETH.sol";


contract Liquidator is IUniswapV2Callee {

    struct RecipientChange {
        address payable recipient;
        uint waitingPeriodEnd;
        bool pending;
    }

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    address constant private ETHER = address(0);
    address constant private CETH = 0xBe839b6D93E3eA47eFFcCA1F27841C917a8794f3;
    address constant private WETH = 0xc778417E063141139Fce010982780140Aa0cD5Ab;
    address constant private ROUTER = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address constant private FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    uint constant private RECIP_CHANGE_WAIT_PERIOD = 24 hours;

    address payable private recipient;
    RecipientChange public recipientChange;

    Comptroller public comptroller;
    PriceOracle public priceOracle;

    event RevenueWithdrawn(
        address recipient,
        address token,
        uint amount
    );
    event RecipientChanged(
        address recipient
    );

    modifier onlyRecipient() {
        require(
            msg.sender == recipient,
            "Only recipient can call this function."
        );
        _;
    }

    constructor() public {
        recipient = msg.sender;
        comptroller = Comptroller(0x54188bBeDD7b68228fa89CbDDa5e3e930459C6c6);
        priceOracle = PriceOracle(0xb2b3d5B4E35881D518fa2062325F118A6Ebb6C4A);
    }

    receive() external payable {}

    function kill() public onlyRecipient {
        // Delete the contract and send any remaining funds to recipient
        selfdestruct(recipient);
    }

    function initiateRecipientChange(address payable _recipient) public onlyRecipient returns (address) {
        recipientChange = RecipientChange(_recipient, now + RECIP_CHANGE_WAIT_PERIOD, true);
        return recipientChange.recipient;
    }

    function confirmRecipientChange() public onlyRecipient {
        require(recipientChange.pending, "There is no pending recipient change.");
        require(now > recipientChange.waitingPeriodEnd, "The waiting period isn't over yet.");
        
        recipient = recipientChange.recipient;
        emit RecipientChanged(recipient);

        // Clear the recipientChange struct. Equivalent to re-declaring it without initialization
        delete recipientChange;
    }

    function setComptroller(address _comptrollerAddress) public onlyRecipient {
        comptroller = Comptroller(_comptrollerAddress);
    }

    function setPriceOracle(address _oracleAddress) public onlyRecipient {
        priceOracle = PriceOracle(_oracleAddress);
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
            // `!=` uses less gas than `>`
            if (liquidity != 0) continue;
            address repayCToken = _cTokens[i * 2];
            address seizeCToken = _cTokens[i * 2 + 1];

            uint256 uPriceRepay = priceOracle.getUnderlyingPrice(repayCToken);

            // uint256(10**18) adjustments ensure that all place values are dedicated
            // to repay and seize precision rather than unnecessary closeFact and liqIncent decimals
            uint256 repayMax = CErc20(repayCToken).borrowBalanceCurrent(borrower) * closeFact / uint256(10**18);
            uint256 seizeMax = CErc20(seizeCToken).balanceOfUnderlying(borrower) * uint256(10**18) / liqIncent;

            uint256 repayMax_Eth = repayMax * uPriceRepay;
            uint256 seizeMax_Eth = seizeMax * priceOracle.getUnderlyingPrice(seizeCToken);

            uint256 repay_Eth = (repayMax_Eth < seizeMax_Eth) ? repayMax_Eth : seizeMax_Eth;
            uint256 repay = repay_Eth / uPriceRepay;

            liquidate(borrower, repayCToken, seizeCToken, repay);
            if (gasleft() < 2000000) break;
        }
    }

    /**
     * Liquidate a Compound user with a flash loan
     *
     * @param _borrower (address): the Compound user to liquidate
     * @param _repayCToken (address): a CToken for which the user is in debt
     * @param _seizeCToken (address): a CToken for which the user has a supply balance
     * @param _amount (uint256): the amount (specified in units of _repayCToken.underlying) to flash loan and pay off
     */
    function liquidate(address _borrower, address _repayCToken, address _seizeCToken, uint256 _amount) public {
        address pair;
        address r;

        if (_repayCToken == _seizeCToken || _seizeCToken == CETH) {
            r = CErc20Storage(_repayCToken).underlying();
            pair = UniswapV2Library.pairFor(FACTORY, r, WETH);
        }
        else if (_repayCToken == CETH) {
            r = WETH;
            pair = UniswapV2Library.pairFor(FACTORY, WETH, CErc20Storage(_seizeCToken).underlying());
        }
        else {
            r = CErc20Storage(_repayCToken).underlying();
            address s = CErc20Storage(_seizeCToken).underlying();
            uint maxBorrow;
            (maxBorrow, , pair) = UniswapV2Library.getReservesWithPair(FACTORY, r, s);

            if (_amount >= maxBorrow) pair = IUniswapV2Factory(FACTORY).getPair(r, WETH);
        }

        // Initiate flash swap
        bytes memory data = abi.encode(_borrower, _repayCToken, _seizeCToken);
        uint amount0 = IUniswapV2Pair(pair).token0() == r ? _amount : 0;
        uint amount1 = IUniswapV2Pair(pair).token1() == r ? _amount : 0;

        IUniswapV2Pair(pair).swap(amount0, amount1, address(this), data);
    }

    /**
     * The function that gets called in the middle of a flash swap
     *
     * @param sender (address): the caller of `swap()`
     * @param amount0 (uint256): the amount of token0 being borrowed
     * @param amount1 (uint256): the amount of token1 being borrowed
     * @param data (bytes): data passed through from the caller
     */
    function uniswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) override external {
        // Unpack parameters sent from the `liquidate` function
        // NOTE: these are being passed in from some other contract, and cannot necessarily be trusted
        (address borrower, address repayCToken, address seizeCToken) = abi.decode(data, (address, address, address));

        address token0 = IUniswapV2Pair(msg.sender).token0();
        address token1 = IUniswapV2Pair(msg.sender).token1();
        require(msg.sender == IUniswapV2Factory(FACTORY).getPair(token0, token1));

        if (repayCToken == seizeCToken) {
            uint amount = amount0 != 0 ? amount0 : amount1;
            address estuary = amount0 != 0 ? token0 : token1;

            // Perform the liquidation
            approve(estuary, repayCToken, amount);
            CErc20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

            // Redeem cTokens for underlying ERC20 or ETH
            CErc20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Compute debt and pay back pair
            IERC20(estuary).transfer(msg.sender, amount.mul(1000).div(997).add(1));
            return;
        }

        if (repayCToken == CETH) {
            uint amount = amount0 != 0 ? amount0 : amount1;
            address estuary = amount0 != 0 ? token1 : token0;

            // Convert WETH to ETH
            IWETH(WETH).withdraw(amount);

            // Perform the liquidation
            CEther(repayCToken).liquidateBorrow{value: amount}(borrower, seizeCToken);

            // Redeem cTokens for underlying ERC20
            CErc20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Compute debt and pay back pair
            (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, WETH, estuary);
            IERC20(estuary).transfer(msg.sender, UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut));
            return;
        }

        if (seizeCToken == CETH) {
            uint amount = amount0 != 0 ? amount0 : amount1;
            address source = amount0 != 0 ? token0 : token1;

            // Perform the liquidation
            approve(source, repayCToken, amount);
            CErc20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

            // Redeem cTokens for underlying ERC20 or ETH
            CErc20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));

            // Convert ETH to WETH
            IWETH(WETH).deposit{value: address(this).balance}();

            // Compute debt and pay back pair
            (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, source, WETH);
            IERC20(WETH).transfer(msg.sender, UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut));
            return;
        }

        uint amount;
        address source;
        address estuary;
        if (amount0 != 0) {
            amount = amount0;
            source = token0;
            estuary = token1;
        } else {
            amount = amount1;
            source = token1;
            estuary = token0;
        }

        // Perform the liquidation
        approve(source, repayCToken, amount);
        CErc20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

        // Redeem cTokens for underlying ERC20 or ETH
        uint seized_uUnits = CErc20(seizeCToken).balanceOfUnderlying(address(this));
        CErc20(seizeCToken).redeem(IERC20(seizeCToken).balanceOf(address(this)));
        address seizeUToken = CErc20Storage(seizeCToken).underlying();

        // Compute debt
        (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, source, estuary);
        uint debt = UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut);

        if (seizeUToken == estuary) {
            // Pay back pair
            IERC20(estuary).transfer(msg.sender, debt);
            return;
        }

        IERC20(seizeUToken).safeApprove(ROUTER, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF);
        // Define swapping path
        address[] memory path = new address[](2);
        path[0] = seizeUToken;
        path[1] = estuary;
        //                                                  desired, max sent,   path, recipient,     deadline
        IUniswapV2Router02(ROUTER).swapTokensForExactTokens(debt, seized_uUnits, path, address(this), now + 1 minutes);

        // Pay back pair
        IERC20(estuary).transfer(msg.sender, debt);
    }

    function withdraw(address _assetAddress) public {
        uint assetBalance;
        if (_assetAddress == ETHER) {
            address self = address(this); // workaround for a possible solidity bug
            assetBalance = self.balance;
            recipient.transfer(assetBalance);
        } else {
            assetBalance = IERC20(_assetAddress).balanceOf(address(this));
            IERC20(_assetAddress).safeTransfer(recipient, assetBalance);
        }
        emit RevenueWithdrawn(recipient, _assetAddress, assetBalance);
    }
}

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
    address constant private FACTORY = 0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f;
    uint constant private RECIP_CHANGE_WAIT_PERIOD = 24 hours;

    address payable private recipient;
    RecipientChange public recipientChange;

    IUniswapV2Router02 public router;
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
        router = IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D);
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

    function setRouter(address _routerAddress) public onlyRecipient {
        router = IUniswapV2Router02(_routerAddress);
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
            uint256 uPriceSeize = priceOracle.getUnderlyingPrice(seizeCToken);

            // uint256(10**18) adjustments ensure that all place values are dedicated
            // to repay and seize precision rather than unnecessary closeFact and liqIncent decimals
            uint256 repayMax = CErc20(repayCToken).borrowBalanceCurrent(borrower) * closeFact / uint256(10**18);
            uint256 seizeMax = CErc20(seizeCToken).balanceOfUnderlying(borrower) * uint256(10**18) / liqIncent;

            uint256 repayMax_Eth = repayMax * uPriceRepay;
            uint256 seizeMax_Eth = seizeMax * uPriceSeize;

            uint256 repay_Eth = (repayMax_Eth < seizeMax_Eth) ? repayMax_Eth : seizeMax_Eth;
            uint256 repay = repay_Eth / uPriceRepay;

            if ((i != 0) && (tx.gasprice * 1500000 > repay_Eth * (liqIncent - uint256(10**18)))) break;
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
        address tokenA;
        address tokenB;

        if (_repayCToken == _seizeCToken) {
            tokenA = CErc20Storage(_repayCToken).underlying();
            tokenB = WETH;
        }
        else if (_repayCToken == CETH) {
            tokenA = WETH;
            tokenB = CErc20Storage(_seizeCToken).underlying();
        }
        else if (_seizeCToken == CETH) {
            tokenA = CErc20Storage(_repayCToken).underlying();
            tokenB = WETH;
        }
        else {
            tokenA = CErc20Storage(_repayCToken).underlying();
            tokenB = WETH;
            // TODO if liquidity is high enough, we could set tokenB to be the seizeCToken underlying
            // --> (would require some modifications to the uniswapV2Call function)
        }

        // Retrieve the Uniswap pair
        IUniswapV2Pair pair = IUniswapV2Pair(IUniswapV2Factory(FACTORY).getPair(tokenA, tokenB));
        // Initiate flash swap
        bytes memory data = abi.encode(_borrower, _repayCToken, _seizeCToken);
        uint amount0 = pair.token0() == tokenA ? _amount : 0;
        uint amount1 = pair.token1() == tokenA ? _amount : 0;

        pair.swap(amount0, amount1, address(this), data);
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

        address estuary;
        uint debt;

        if (repayCToken == CETH) {
            // Convert WETH to ETH
            uint amount = token0 == WETH ? amount0 : amount1;
            IWETH(WETH).withdraw(amount);

            // Perform the liquidation
            CEther(repayCToken).liquidateBorrow{value: amount}(borrower, seizeCToken);

            // Redeem cTokens for underlying ERC20
            uint reward_cUnits = IERC20(seizeCToken).balanceOf(address(this));
            // uint reward_uUnits = CErc20(seizeCToken).balanceOfUnderlying(address(this));
            require(CErc20(seizeCToken).redeem(reward_cUnits) == 0, "Unable to redeem collateral reward.");

            // *Assume* that when Eth is being repaid, the other token in the Uniswap pair
            // is the one being seized
            estuary = token0 == WETH ? token1 : token0;
            // address seizeUToken = CErc20Storage(seizeCToken).underlying();
            // require(seizeUToken == neededToken, "Expected seized token to be in Uniswap pair");

            (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, WETH, estuary);
            debt = UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut);

            IERC20(estuary).transfer(msg.sender, debt);
            return;
        }

        // address repayUToken = CErc20Storage(repayCToken).underlying();
        // uint amount = token0 == repayUToken ? amount0 : amount1;

        address repayUToken;
        uint amount;
        if (amount0 != 0) {
            repayUToken = token0;
            amount = amount0;
        } else {
            repayUToken = token1;
            amount = amount1;
        }

        // The borrower took out a loan from CToken contract X. Before we can liquidate them,
        // we must approve contract X to take our money.
        approve(repayUToken, repayCToken, amount);
        // Perform the liquidation. If all goes well, we receive an amount of seizeCTokens
        // equivalent to the amount we repaid, multiplied by the liquidation incentive.
        CErc20(repayCToken).liquidateBorrow(borrower, amount, seizeCToken);

        // Redeem cTokens for underlying ERC20 or ETH
        uint reward_uUnits = CErc20(seizeCToken).balanceOfUnderlying(address(this));
        require(CErc20(seizeCToken).redeemUnderlying(reward_uUnits) == 0, "Unable to redeem collateral reward.");

        if (repayCToken == seizeCToken) {
            estuary = repayUToken;
            debt = amount.mul(1000).div(997).add(1);
        }
        else if (seizeCToken == CETH) {
            estuary = WETH;
            (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, repayUToken, estuary);
            debt = UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut);

            IWETH(estuary).deposit{value: reward_uUnits}();
            require(debt < reward_uUnits, "Debt too large");
        }
        else {
            estuary = WETH;
            (uint reserveOut, uint reserveIn) = UniswapV2Library.getReserves(FACTORY, repayUToken, estuary);
            debt = UniswapV2Library.getAmountIn(amount, reserveIn, reserveOut);

            // Set deadline for swap transaction, which shouldn't matter since it's atomic.
            uint256 deadline = now + 1 minutes;
            // In this case, we have to figure out what token corresponds to reward_uUnits.
            // Then we tell the router it's approved to swap that amount.
            address seizeUToken = CErc20Storage(seizeCToken).underlying();
            IERC20(seizeUToken).safeApprove(address(router), reward_uUnits);
            // Define swapping path
            address[] memory path = new address[](2);
            path[0] = seizeUToken;
            path[1] = WETH;
            //                              desired,   amount traded, path, recipient,     deadline
            router.swapTokensForExactTokens(debt, reward_uUnits, path, address(this), deadline);
        }

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

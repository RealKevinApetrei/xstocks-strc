// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title Batcher — Atomic Wrap + Deposit + Borrow
 *
 * Problem: Doing wrap → deposit collateral → borrow in 3 separate transactions
 * creates partial-state risk and bad UX. This contract does all three atomically.
 *
 * One transaction:
 *   User STRC → wrap to wSTRC → supply as Morpho collateral → borrow USDC → send to caller
 *
 * The loop executor calls this contract repeatedly (off-chain) to build leverage.
 * Each call is one loop iteration.
 *
 * AUTHORIZATION REQUIRED:
 *   Before calling any function here, the user must:
 *   1. approve(STRC, batcherAddress, amount)     — ERC20 approval for STRC
 *   2. approve(wSTRC, morphoAddress, amount)      — Morpho needs to pull wSTRC
 *   3. morpho.setAuthorization(batcherAddress, true) — lets Batcher borrow on user's behalf
 *
 * NOTE: The Batcher borrows on behalf of the user (onBehalf = user).
 *       The position is owned by the user in Morpho, not by this contract.
 *       This means users can interact with Morpho directly too.
 */

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IwSTRC} from "./interfaces/IwSTRC.sol";

interface IMorpho {
    struct MarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }
    function supplyCollateral(MarketParams calldata, uint256, address, bytes calldata) external;
    function borrow(MarketParams calldata, uint256, uint256, address, address) external returns (uint256, uint256);
    function repay(MarketParams calldata, uint256, uint256, address, bytes calldata) external returns (uint256, uint256);
    function withdrawCollateral(MarketParams calldata, uint256, address, address) external;
}

interface IPythOracle {
    function updatePrice(bytes[] calldata updateData) external payable;
}

contract Batcher {
    // ─── Immutables ──────────────────────────────────────────────────────────────

    IERC20      public immutable strc;    // 0x1Aad217B8F78dbA5E6693460e8470F8b1A3977f3
    IwSTRC      public immutable wstrc;   // deployed wSTRC address
    IERC20      public immutable usdc;    // USDC address on INK
    IMorpho     public immutable morpho;  // 0x857f3EefE8cbda3Bc49367C996cd664A880d3042
    IPythOracle public immutable oracle;  // deployed PythOracleAdapter address

    // The market params for wSTRC/USDC on Morpho
    // Set once at deploy time
    IMorpho.MarketParams public marketParams;

    // ─── Events ─────────────────────────────────────────────────────────────────

    event LoopExecuted(
        address indexed user,
        uint256 strcDeposited,
        uint256 wstrcMinted,
        uint256 usdcBorrowed
    );

    event PositionClosed(
        address indexed user,
        uint256 usdcRepaid,
        uint256 strcReturned
    );

    // ─── Constructor ─────────────────────────────────────────────────────────────

    constructor(
        address _strc,
        address _wstrc,
        address _usdc,
        address _morpho,
        address _oracle,
        address _irm,
        uint256 _lltv
    ) {
        strc   = IERC20(_strc);
        wstrc  = IwSTRC(_wstrc);
        usdc   = IERC20(_usdc);
        morpho = IMorpho(_morpho);
        oracle = IPythOracle(_oracle);

        marketParams = IMorpho.MarketParams({
            loanToken:       _usdc,
            collateralToken: _wstrc,
            oracle:          _oracle,
            irm:             _irm,    // 0x9515407b1512F53388ffE699524100e7270Ee57B
            lltv:            _lltv    // 860000000000000000 (86% in 1e18)
        });

        // Pre-approve Morpho to pull wSTRC for collateral
        IERC20(_wstrc).approve(_morpho, type(uint256).max);
        // Pre-approve Morpho to pull USDC for repayment
        IERC20(_usdc).approve(_morpho, type(uint256).max);
    }

    // ─── Core: One Loop Iteration ────────────────────────────────────────────────

    /**
     * @notice Execute one loop: pull STRC from user, wrap it, deposit as collateral, borrow USDC.
     *
     * @dev The loop executor calls this multiple times (off-chain) to reach target leverage.
     *      Between calls, the executor swaps USDC → STRC via CoW Swap and passes the
     *      resulting STRC back into the next call.
     *
     * @param user            The user whose Morpho position to operate on.
     * @param strcAmount      STRC to pull from user (or from executor after swap).
     * @param usdcToBorrow    How much USDC to borrow in this iteration.
     * @param pythUpdateData  Fresh Pyth price data (fetch from Hermes API before calling).
     */
    function executeLoop(
        address user,
        uint256 strcAmount,
        uint256 usdcToBorrow,
        bytes[] calldata pythUpdateData
    ) external payable {
        // 1. Push fresh Pyth price on-chain (required before Morpho reads oracle)
        if (pythUpdateData.length > 0) {
            oracle.updatePrice{value: msg.value}(pythUpdateData);
        }

        // 2. Pull STRC from caller (user on first loop, executor on subsequent loops)
        strc.transferFrom(msg.sender, address(this), strcAmount);

        // 3. Approve wSTRC contract to pull STRC
        strc.approve(address(wstrc), strcAmount);

        // 4. Wrap STRC → wSTRC
        uint256 wstrcMinted = wstrc.wrap(strcAmount);

        // 5. Supply wSTRC as collateral on behalf of user
        //    onBehalf = user means the position is owned by the user in Morpho
        morpho.supplyCollateral(marketParams, wstrcMinted, user, "");

        // 6. Borrow USDC on behalf of user, send to caller (loop executor)
        morpho.borrow(marketParams, usdcToBorrow, 0, user, msg.sender);

        emit LoopExecuted(user, strcAmount, wstrcMinted, usdcToBorrow);
    }

    // ─── Exit: Unwind One Loop ───────────────────────────────────────────────────

    /**
     * @notice Repay USDC debt and withdraw wSTRC collateral (one unwind step).
     *
     * @dev The loop executor calls this in reverse to unwind the position.
     *      Between calls, executor swaps withdrawn wSTRC → STRC → USDC via CoW Swap.
     *
     * @param user            The user whose position to unwind.
     * @param usdcToRepay     Amount of USDC to repay (0 to repay all).
     * @param wstrcToWithdraw Amount of wSTRC collateral to withdraw after repay.
     * @param pythUpdateData  Fresh Pyth price data.
     */
    function unwindLoop(
        address user,
        uint256 usdcToRepay,
        uint256 wstrcToWithdraw,
        bytes[] calldata pythUpdateData
    ) external payable {
        // 1. Push fresh Pyth price
        if (pythUpdateData.length > 0) {
            oracle.updatePrice{value: msg.value}(pythUpdateData);
        }

        // 2. Pull USDC from caller to repay
        if (usdcToRepay > 0) {
            usdc.transferFrom(msg.sender, address(this), usdcToRepay);
            // Repay on behalf of user (shares=0 means repay exact assets amount)
            morpho.repay(marketParams, usdcToRepay, 0, user, "");
        }

        // 3. Withdraw wSTRC collateral, send to caller
        if (wstrcToWithdraw > 0) {
            morpho.withdrawCollateral(marketParams, wstrcToWithdraw, user, msg.sender);
        }
    }

    // ─── View: Position Health ───────────────────────────────────────────────────

    /**
     * @notice Returns the market ID for this wSTRC/USDC market.
     * @dev Morpho identifies markets by a hash of their params.
     */
    function getMarketId() external view returns (bytes32) {
        return keccak256(abi.encode(marketParams));
    }

    // ─── Receive ETH (for Pyth fees) ────────────────────────────────────────────
    receive() external payable {}
}

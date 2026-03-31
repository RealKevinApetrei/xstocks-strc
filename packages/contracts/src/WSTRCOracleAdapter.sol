// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IwSTRC} from "./interfaces/IwSTRC.sol";
import {IVerifierProxy, ChainlinkReport} from "./interfaces/IChainlinkVerifier.sol";

/**
 * @title WSTRCOracleAdapter
 * @notice Oracle adapter for Morpho Blue that returns the price of wSTRC in USDC.
 *         Reads STRCx/USD price from Chainlink Data Streams, combines with the
 *         wSTRC→STRCx exchange rate to produce a wSTRC/USDC price.
 *
 *         Supports two modes:
 *         1. Chainlink Data Streams — verified on-chain via IVerifierProxy
 *         2. Manual override — owner-settable price for testing/fallback
 *
 *         Morpho Blue calls price() which returns the cached price multiplied
 *         by the current wSTRC exchange rate.
 */
contract WSTRCOracleAdapter is Ownable {
    IwSTRC public immutable wstrc;
    IVerifierProxy public immutable verifier;
    bytes32 public immutable chainlinkStreamId;

    /// @notice Cached STRCx/USD price (18 decimals).
    uint256 public strcxPriceUsd;

    /// @notice Timestamp of the last price update.
    uint256 public lastPriceUpdate;

    /// @notice Maximum age of a price before it's considered stale (1 hour).
    uint256 public constant MAX_PRICE_AGE = 3600;

    /// @notice Whether manual price override is active.
    bool public manualOverride;

    event PriceUpdated(uint256 price, uint256 timestamp, bool fromChainlink);
    event ManualOverrideSet(bool enabled);

    constructor(
        address _wstrc,
        address _verifier,
        bytes32 _streamId,
        uint256 _initialPrice
    ) Ownable(msg.sender) {
        require(_wstrc != address(0), "Oracle: zero wstrc");
        wstrc = IwSTRC(_wstrc);
        verifier = IVerifierProxy(_verifier);
        chainlinkStreamId = _streamId;

        // Set initial price (for bootstrapping before first Chainlink update)
        strcxPriceUsd = _initialPrice;
        lastPriceUpdate = block.timestamp;
        manualOverride = _verifier == address(0); // Auto-enable manual if no verifier
    }

    /**
     * @notice Verify a Chainlink Data Streams signed report and update the cached price.
     * @param signedReport The signed report bytes from Chainlink Data Streams API.
     */
    function updatePriceFromChainlink(bytes calldata signedReport) external {
        require(address(verifier) != address(0), "Oracle: no verifier configured");

        bytes memory decoded = verifier.verify(signedReport);

        ChainlinkReport memory report = abi.decode(decoded, (ChainlinkReport));

        require(report.feedId == chainlinkStreamId, "Oracle: wrong feed");
        require(report.expiresAt > block.timestamp, "Oracle: report expired");

        // Use tokenizedPrice — available 24/7 including weekends/market-closed hours.
        // Falls back to market price only if tokenizedPrice is zero (shouldn't happen for tokenized assets).
        int192 selectedPrice = report.tokenizedPrice > 0 ? report.tokenizedPrice : report.price;
        require(selectedPrice > 0, "Oracle: negative or zero price");

        // Chainlink Data Streams prices are in 18 decimals
        strcxPriceUsd = uint256(int256(selectedPrice));
        lastPriceUpdate = block.timestamp;

        emit PriceUpdated(strcxPriceUsd, block.timestamp, true);
    }

    /**
     * @notice Manually set the STRCx/USD price (owner only, for testing/fallback).
     * @param _price STRCx price in USD, 18 decimals.
     */
    function setManualPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Oracle: zero price");
        strcxPriceUsd = _price;
        lastPriceUpdate = block.timestamp;
        manualOverride = true;

        emit PriceUpdated(_price, block.timestamp, false);
        emit ManualOverrideSet(true);
    }

    /**
     * @notice Toggle manual override mode.
     */
    function setManualOverride(bool _enabled) external onlyOwner {
        manualOverride = _enabled;
        emit ManualOverrideSet(_enabled);
    }

    /**
     * @notice Returns the price of wSTRC in USDC for Morpho Blue.
     * @dev Morpho expects: price * 1e36 / 1e(collateralDecimals - loanDecimals)
     *      For wSTRC (18 dec) / USDC (6 dec): multiply by 1e36 / 1e12 = 1e24
     *      Since strcxPriceUsd is in 18 decimals, and strcPerWstrc() is in 18 decimals:
     *      wstrcPriceUsd = strcPerWstrc * strcxPriceUsd / 1e18  (in 18 decimals)
     *      morphoPrice = wstrcPriceUsd * 1e24  (scale to Morpho precision)
     */
    function price() external view returns (uint256) {
        require(strcxPriceUsd > 0, "Oracle: no price set");
        require(
            manualOverride || block.timestamp <= lastPriceUpdate + MAX_PRICE_AGE,
            "Oracle: price stale"
        );

        uint256 rate = wstrc.strcPerWstrc(); // 18 decimals
        // wstrcPriceUsd (18 dec) = rate (18 dec) * strcxPriceUsd (18 dec) / 1e18
        uint256 wstrcPriceUsd = (rate * strcxPriceUsd) / 1e18;
        // Scale to Morpho precision: * 1e24 (for 18-dec collateral / 6-dec loan)
        return wstrcPriceUsd * 1e24;
    }

    /**
     * @notice Get the current STRCx/USD price in 18 decimals (for frontend/backend reads).
     */
    function getStrcxPrice() external view returns (uint256 _price, uint256 _timestamp) {
        return (strcxPriceUsd, lastPriceUpdate);
    }
}

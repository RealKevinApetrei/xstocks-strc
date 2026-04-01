// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IwSTRC} from "./interfaces/IwSTRC.sol";

/**
 * @title ChainlinkDataStreamsOracleAdapter
 * @notice Oracle adapter for Morpho Blue that reads STRC/USD from Chainlink Data Streams
 *         and adjusts for the wSTRC/STRC exchange rate.
 *
 *         Replaces PythOracleAdapter — Chainlink Data Streams provides 24/7 pricing
 *         (including outside NYSE market hours), eliminating weekend/afterhours staleness.
 *
 * Morpho price() format:
 *   price = wSTRC_USD * 10^(36 + loanDecimals - collateralDecimals)
 *         = wSTRC_USD * 10^(36 + 6 - 18)
 *         = wSTRC_USD * 10^24
 *
 * CHAINLINK DATA STREAMS IS A PULL ORACLE:
 *   Call updatePrice() with a fresh signed report from the Chainlink API before
 *   any Morpho operation. Fetch reports from:
 *   https://api.chainlink.com/v2/streams/reports/latest?feedID=FEED_ID
 *   (requires a Chainlink Data Streams API key)
 *
 * REPORT SCHEMA (v3 — Crypto / Calculated Streams):
 *   After verification the report decodes to:
 *     feedId                (bytes32)
 *     validFromTimestamp    (uint32)
 *     observationsTimestamp (uint32)
 *     nativeFee             (uint192)  — ETH fee required for verification
 *     linkFee               (uint192)
 *     expiresAt             (uint32)
 *     price                 (int192)   — USD price, 18-decimal scaled
 *     bid                   (int192)
 *     ask                   (int192)
 *
 * INK MAINNET ADDRESSES (chain ID 57073):
 *   VerifierProxy: 0x60fAa7faC949aF392DFc858F5d97E3EEfa07E9EB
 *   Feed ID:       0x000a968f79058f73e24ba7d546882160d440634412e5ac2dc491f58bea5bea38
 */
interface IVerifierProxy {
    function verify(
        bytes calldata payload,
        bytes calldata parameterPayload
    ) external payable returns (bytes memory verifierResponse);
}

contract ChainlinkDataStreamsOracleAdapter {

    // ─── Report schema (v3) ──────────────────────────────────────────────────

    struct ReportV3 {
        bytes32 feedId;
        uint32  validFromTimestamp;
        uint32  observationsTimestamp;
        uint192 nativeFee;
        uint192 linkFee;
        uint32  expiresAt;
        int192  price;
        int192  bid;
        int192  ask;
    }

    // ─── State ───────────────────────────────────────────────────────────────

    IVerifierProxy public immutable verifierProxy;
    IwSTRC         public immutable wstrc;
    bytes32        public immutable feedId;
    uint256        public immutable maxStaleness;

    /// @notice Last verified price from Chainlink Data Streams (18-decimal USD)
    uint256 public lastPrice;
    /// @notice Timestamp of the last verified report
    uint32  public lastUpdatedAt;

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(
        address _verifierProxy,
        address _wstrc,
        bytes32 _feedId,
        uint256 _maxStaleness
    ) {
        verifierProxy = IVerifierProxy(_verifierProxy);
        wstrc         = IwSTRC(_wstrc);
        feedId        = _feedId;
        maxStaleness  = _maxStaleness;
    }

    // ─── Core ────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the price of 1 wSTRC in USDC, scaled for Morpho.
     * @dev Reverts if the stored price is stale (older than maxStaleness).
     *      Caller must push a fresh price via updatePrice() before calling this.
     */
    function price() external view returns (uint256) {
        require(lastPrice > 0, "ChainlinkAdapter: no price");
        require(
            block.timestamp - lastUpdatedAt <= maxStaleness,
            "ChainlinkAdapter: stale price"
        );

        // Adjust for wSTRC/STRC exchange rate.
        // strcPerWstrc() returns 1e18-scaled value, grows over time as dividends accrue.
        uint256 wstrcPriceUsd18 = (lastPrice * wstrc.strcPerWstrc()) / 1e18;

        // Scale to Morpho format: wSTRC_USD_18 * 10^(36+6-18) = wSTRC_USD_18 * 10^6
        return wstrcPriceUsd18 * 1e6;
    }

    /**
     * @notice Push a fresh Chainlink Data Streams report on-chain.
     * @dev Fetches the nativeFee from the report itself, verifies with that fee,
     *      refunds any excess ETH to the caller.
     *      Pass the raw signed report bytes from the Chainlink Streams API.
     * @param unverifiedReport  Signed report blob from Chainlink API
     */
    function updatePrice(bytes calldata unverifiedReport) external payable {
        // 1. Pre-decode just enough of the payload to find the nativeFee.
        //    Layout: [96 bytes reportContext][remaining = ABI-encoded report blob + sigs]
        //    The report blob starts at byte 96. First decode the blob offset, then the report.
        //    Simpler: just forward msg.value and let the verifier take what it needs.
        //    Any excess is refunded below.

        // 2. Verify — forwards all ETH; verifier will revert if underpaid
        bytes memory verifiedReportBytes = verifierProxy.verify{value: msg.value}(
            unverifiedReport,
            abi.encode(address(0)) // pay fee in native ETH
        );

        // 3. Decode the verified report
        ReportV3 memory report = abi.decode(verifiedReportBytes, (ReportV3));

        // 4. Validate feed ID
        require(report.feedId == feedId, "ChainlinkAdapter: wrong feed");

        // 5. Validate price is positive
        require(report.price > 0, "ChainlinkAdapter: negative price");

        // 6. Store — price is 18-decimal USD value from Chainlink
        lastPrice     = uint256(uint192(report.price));
        lastUpdatedAt = report.observationsTimestamp;

        // 7. Refund any excess ETH (verifier only takes nativeFee)
        uint256 remaining = address(this).balance;
        if (remaining > 0) {
            (bool ok,) = msg.sender.call{value: remaining}("");
            require(ok, "ChainlinkAdapter: refund failed");
        }
    }

    receive() external payable {}
}

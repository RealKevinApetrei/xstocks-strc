// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Chainlink Data Streams IVerifierProxy interface.
interface IVerifierProxy {
    /// @notice Verifies a signed report and returns the decoded report data.
    function verify(bytes calldata signedReport) external payable returns (bytes memory);
}

/// @notice Decoded Chainlink Data Streams Report Schema v10 (Tokenized Assets).
/// @dev tokenizedPrice is available 24/7 including weekends when market price may be stale.
///      Use tokenizedPrice as the primary price source for continuous operation.
struct ChainlinkReport {
    bytes32 feedId;              // Stream ID
    uint32 validFromTimestamp;   // Earliest timestamp the report is valid
    uint32 observationsTimestamp; // Latest timestamp the report covers
    int192 nativeFee;            // Fee in native token
    int192 linkFee;              // Fee in LINK
    uint32 expiresAt;            // Report expiry timestamp
    int192 price;                // Market price (may be stale on weekends)
    int192 bid;                  // Bid price
    int192 ask;                  // Ask price
    int192 tokenizedPrice;       // 24/7 tokenized price (available on weekends)
}

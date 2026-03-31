// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Pyth Network price struct.
struct PythPrice {
    int64 price;
    uint64 conf;
    int32 expo;
    uint256 publishTime;
}

/// @notice Minimal Pyth Network interface for reading prices.
interface IPyth {
    /// @notice Returns the latest price for a given price feed ID.
    function getPrice(bytes32 id) external view returns (PythPrice memory price);

    /// @notice Returns the latest price if it's not older than `age` seconds.
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (PythPrice memory price);

    /// @notice Update price feeds with the given update data. Requires payment of the update fee.
    function updatePriceFeeds(bytes[] calldata updateData) external payable;

    /// @notice Get the fee required to update the given number of price feeds.
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256 feeAmount);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IPyth {
    struct Price {
        int64  price;
        uint64 conf;
        int32  expo;
        uint   publishTime;
    }

    function getPriceNoOlderThan(bytes32 id, uint age) external view returns (Price memory);
    function updatePriceFeeds(bytes[] calldata updateData) external payable;
    function getUpdateFee(bytes[] calldata updateData) external view returns (uint256);
}

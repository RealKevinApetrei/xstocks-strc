// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IwSTRC} from "./interfaces/IwSTRC.sol";
import {IPyth} from "./interfaces/IPyth.sol";

/**
 * @title PythOracleAdapter
 * @notice Oracle adapter for Morpho Blue that reads STRC/USD from Pyth
 *         and adjusts for the wSTRC/STRC exchange rate.
 *
 *         Replaces WSTRCOracleAdapter for mainnet — no manual price setting.
 *
 * Morpho price() format:
 *   price = wSTRC_USD * 10^(36 + loanDecimals - collateralDecimals)
 *         = wSTRC_USD * 10^(36 + 6 - 18)
 *         = wSTRC_USD * 10^24
 *
 * PYTH IS A PULL ORACLE:
 *   Call updatePrice() with fresh data from Hermes before any Morpho operation.
 *   Fetch update data from:
 *   https://hermes.pyth.network/v2/updates/price/latest?ids[]=STRC_FEED_ID
 *
 * WEEKEND BEHAVIOUR:
 *   Pyth only publishes STRC/USD during NYSE hours.
 *   With maxStaleness = 86400 (24h), this oracle reverts on weekends —
 *   automatically preventing new borrows when markets are closed.
 *
 * INK ADDRESSES:
 *   Pyth:         0x2880aB155794e7179c9eE2e38200202908C17B43
 *   STRC feed ID: 0x27c7bbc9755d847f7fc63620c2edcc6a91d2c0c67a28c7999907b59c505b3c17
 */
contract PythOracleAdapter {

    IPyth  public immutable pyth;
    IwSTRC public immutable wstrc;

    bytes32 public immutable priceFeedId;
    uint256 public immutable maxStaleness;

    constructor(
        address _pyth,
        address _wstrc,
        bytes32 _priceFeedId,
        uint256 _maxStaleness
    ) {
        pyth         = IPyth(_pyth);
        wstrc        = IwSTRC(_wstrc);
        priceFeedId  = _priceFeedId;
        maxStaleness = _maxStaleness;
    }

    /**
     * @notice Returns the price of 1 wSTRC in USDC, scaled for Morpho.
     * @dev Reverts if the Pyth price is stale (weekend / market closed).
     *      Caller must push a fresh price via updatePrice() before calling this.
     */
    function price() external view returns (uint256) {
        // 1. Fetch STRC/USD from Pyth — reverts if older than maxStaleness
        IPyth.Price memory p = pyth.getPriceNoOlderThan(priceFeedId, maxStaleness);
        require(p.price > 0, "PythOracleAdapter: negative price");

        // 2. Convert Pyth price to 18-decimal USD value
        uint256 strcPriceUsd18 = _toUsd18(uint256(uint64(p.price)), p.expo);

        // 3. Adjust for wSTRC/STRC exchange rate
        //    strcPerWstrc() returns 1e18-scaled value (grows over time as dividends accrue)
        uint256 wstrcPriceUsd18 = (strcPriceUsd18 * wstrc.strcPerWstrc()) / 1e18;

        // 4. Scale to Morpho format: * 10^24 / 10^18 = * 10^6
        return wstrcPriceUsd18 * 1e6;
    }

    /**
     * @notice Push a fresh Pyth price on-chain before any Morpho operation.
     * @dev Fetch updateData from Hermes API, pass ETH to cover the Pyth fee.
     */
    function updatePrice(bytes[] calldata updateData) external payable {
        uint256 fee = pyth.getUpdateFee(updateData);
        pyth.updatePriceFeeds{value: fee}(updateData);
    }

    /**
     * @dev Convert a Pyth price (with expo) to a 1e18-scaled USD value.
     *      Pyth expo is typically negative (e.g. -8 means divide by 1e8).
     */
    function _toUsd18(uint256 rawPrice, int32 expo) internal pure returns (uint256) {
        if (expo >= 0) {
            return rawPrice * (10 ** uint32(expo)) * 1e18;
        } else {
            uint256 absExpo = uint256(uint32(-expo));
            if (absExpo <= 18) {
                return rawPrice * (10 ** (18 - absExpo));
            } else {
                return rawPrice / (10 ** (absExpo - 18));
            }
        }
    }

    receive() external payable {}
}

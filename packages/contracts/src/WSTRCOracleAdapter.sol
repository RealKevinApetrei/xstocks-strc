// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IwSTRC} from "./interfaces/IwSTRC.sol";
import {IPyth, PythPrice} from "./interfaces/IPyth.sol";

/**
 * @title WSTRCOracleAdapter
 * @notice Oracle adapter for Morpho Blue — wSTRC/USDC price.
 *         Reads STRCx/USD from Pyth Network pull oracle on-chain,
 *         combines with wSTRC→STRCx exchange rate.
 *
 *         Two modes:
 *         1. Pyth on-chain — verified price from Pyth EVM contract
 *         2. Manual override — owner-settable for testing/fallback
 */
contract WSTRCOracleAdapter is Ownable {
    IwSTRC public immutable wstrc;
    IPyth public immutable pyth;
    bytes32 public immutable pythPriceFeedId;

    uint256 public constant MAX_PRICE_AGE = 3600;

    uint256 public manualPrice; // 18 decimals
    bool public manualOverride;

    event ManualPriceSet(uint256 price);
    event ManualOverrideSet(bool enabled);

    constructor(
        address _wstrc,
        address _pyth,
        bytes32 _priceFeedId,
        uint256 _initialManualPrice
    ) Ownable(msg.sender) {
        require(_wstrc != address(0), "Oracle: zero wstrc");
        wstrc = IwSTRC(_wstrc);
        pyth = IPyth(_pyth);
        pythPriceFeedId = _priceFeedId;
        manualPrice = _initialManualPrice;
        manualOverride = _pyth == address(0);
    }

    /**
     * @notice wSTRC/USDC price for Morpho Blue.
     * @dev Morpho scale: price * 1e36 / 1e(collateralDec - loanDec)
     *      wSTRC(18) / USDC(6) → multiply by 1e24
     */
    function price() external view returns (uint256) {
        uint256 strcxPriceUsd = _getStrcxPrice();
        uint256 rate = wstrc.strcPerWstrc();
        uint256 wstrcPriceUsd = (rate * strcxPriceUsd) / 1e18;
        return wstrcPriceUsd * 1e24;
    }

    function _getStrcxPrice() internal view returns (uint256) {
        if (manualOverride) {
            require(manualPrice > 0, "Oracle: no manual price");
            return manualPrice;
        }

        require(address(pyth) != address(0), "Oracle: no Pyth");
        PythPrice memory p = pyth.getPriceNoOlderThan(pythPriceFeedId, MAX_PRICE_AGE);
        require(p.price > 0, "Oracle: zero price");

        // Convert Pyth price to 18 decimals
        uint256 rawPrice = uint256(uint64(p.price));
        if (p.expo < 0) {
            uint256 dec = uint256(uint32(-p.expo));
            if (dec < 18) rawPrice = rawPrice * (10 ** (18 - dec));
            else if (dec > 18) rawPrice = rawPrice / (10 ** (dec - 18));
        } else {
            rawPrice = rawPrice * (10 ** (uint256(uint32(p.expo)) + 18));
        }
        return rawPrice;
    }

    function getStrcxPrice() external view returns (uint256 _price, uint256 _timestamp) {
        if (manualOverride) return (manualPrice, block.timestamp);
        PythPrice memory p = pyth.getPrice(pythPriceFeedId);
        return (_getStrcxPrice(), p.publishTime);
    }

    function setManualPrice(uint256 _price) external onlyOwner {
        require(_price > 0, "Oracle: zero price");
        manualPrice = _price;
        manualOverride = true;
        emit ManualPriceSet(_price);
        emit ManualOverrideSet(true);
    }

    function setManualOverride(bool _enabled) external onlyOwner {
        manualOverride = _enabled;
        emit ManualOverrideSet(_enabled);
    }
}

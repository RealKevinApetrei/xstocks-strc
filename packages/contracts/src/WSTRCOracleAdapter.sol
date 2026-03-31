// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IwSTRC} from "./interfaces/IwSTRC.sol";

/**
 * @title WSTRCOracleAdapter
 * @notice Oracle adapter for Morpho Blue that returns the price of wSTRC in USDC.
 *         Combines the wSTRC→STRC exchange rate with an STRC/USDC price feed.
 *
 *         HACKATHON MODE: STRC/USDC price is owner-settable for demo purposes.
 *         In production, this would read from a Pyth feed or similar.
 */
contract WSTRCOracleAdapter is Ownable {
    IwSTRC public immutable wstrc;

    /// @notice STRC price in USDC, scaled to 1e36 (Morpho's expected precision).
    /// @dev Morpho expects price() to return price * 1e36 / 1e(collateralDecimals - loanDecimals)
    uint256 public strcPriceUsdc;

    constructor(address _wstrc, uint256 _initialStrcPrice) Ownable(msg.sender) {
        require(_wstrc != address(0), "Oracle: zero address");
        wstrc = IwSTRC(_wstrc);
        strcPriceUsdc = _initialStrcPrice;
    }

    /**
     * @notice Returns the price of wSTRC in USDC.
     * @dev Called by Morpho Blue to determine collateral value.
     *      price = strcPerWstrc * strcPriceUsdc / 1e18
     */
    function price() external view returns (uint256) {
        uint256 rate = wstrc.strcPerWstrc(); // 18 decimals
        return (rate * strcPriceUsdc) / 1e18;
    }

    /**
     * @notice Set the STRC/USDC price (hackathon/demo mode).
     * @param _price New STRC price in USDC, scaled to Morpho precision.
     */
    function setStrcPrice(uint256 _price) external onlyOwner {
        strcPriceUsdc = _price;
    }
}

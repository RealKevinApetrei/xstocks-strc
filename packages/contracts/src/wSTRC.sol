// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IwSTRC} from "./interfaces/IwSTRC.sol";

/**
 * @title wSTRC — Wrapped STRC
 * @notice Exchange-rate based wrapper for the rebasing STRC token (wstETH pattern).
 *         STRC is rebasing, meaning balanceOf(address) changes over time.
 *         wSTRC is a standard ERC-20 whose value in STRC increases as STRC rebases up.
 *
 *         Exchange rate = totalSTRCHeld / totalWSTRCSupply
 *         On first wrap (supply=0), rate is 1:1.
 */
contract wSTRC is ERC20, IwSTRC {
    using SafeERC20 for IERC20;

    IERC20 public immutable strc;

    constructor(address _strc) ERC20("Wrapped STRC", "wSTRC") {
        require(_strc != address(0), "wSTRC: zero address");
        strc = IERC20(_strc);
    }

    /// @inheritdoc IwSTRC
    function wrap(uint256 strcAmount) external returns (uint256 wstrcAmount) {
        require(strcAmount > 0, "wSTRC: wrap zero");

        wstrcAmount = strcToWstrc(strcAmount);
        require(wstrcAmount > 0, "wSTRC: wstrc amount rounds to zero");

        strc.safeTransferFrom(msg.sender, address(this), strcAmount);
        _mint(msg.sender, wstrcAmount);

        emit Wrapped(msg.sender, strcAmount, wstrcAmount);
    }

    /// @inheritdoc IwSTRC
    function unwrap(uint256 wstrcAmount) external returns (uint256 strcAmount) {
        require(wstrcAmount > 0, "wSTRC: unwrap zero");
        require(balanceOf(msg.sender) >= wstrcAmount, "wSTRC: insufficient balance");

        strcAmount = wstrcToStrc(wstrcAmount);
        require(strcAmount > 0, "wSTRC: strc amount rounds to zero");

        _burn(msg.sender, wstrcAmount);
        strc.safeTransfer(msg.sender, strcAmount);

        emit Unwrapped(msg.sender, wstrcAmount, strcAmount);
    }

    /// @inheritdoc IwSTRC
    function strcPerWstrc() public view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return 1e18; // 1:1 before first wrap
        return (strc.balanceOf(address(this)) * 1e18) / supply;
    }

    /// @inheritdoc IwSTRC
    function wstrcToStrc(uint256 wstrcAmount) public view returns (uint256) {
        return (wstrcAmount * strcPerWstrc()) / 1e18;
    }

    /// @inheritdoc IwSTRC
    function strcToWstrc(uint256 strcAmount) public view returns (uint256) {
        uint256 rate = strcPerWstrc();
        return (strcAmount * 1e18) / rate;
    }
}

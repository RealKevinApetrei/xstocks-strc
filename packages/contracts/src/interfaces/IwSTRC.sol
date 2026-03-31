// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IwSTRC {
    /// @notice Wrap STRC → wSTRC at the current exchange rate.
    function wrap(uint256 strcAmount) external returns (uint256 wstrcAmount);

    /// @notice Unwrap wSTRC → STRC at the current exchange rate.
    function unwrap(uint256 wstrcAmount) external returns (uint256 strcAmount);

    /// @notice Current exchange rate: how many STRC per 1 wSTRC (18 decimals).
    function strcPerWstrc() external view returns (uint256);

    /// @notice Convert a wSTRC amount to its equivalent STRC value.
    function wstrcToStrc(uint256 wstrcAmount) external view returns (uint256);

    /// @notice Convert a STRC amount to its equivalent wSTRC value.
    function strcToWstrc(uint256 strcAmount) external view returns (uint256);

    event Wrapped(address indexed user, uint256 strcAmount, uint256 wstrcAmount);
    event Unwrapped(address indexed user, uint256 wstrcAmount, uint256 strcAmount);
}

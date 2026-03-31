// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title USDCVault
 * @notice ERC-4626 vault that wraps Tydro (yield vault on Ink).
 *         Users deposit USDC → vault deposits into Tydro for yield.
 *         Grid-buy strategy withdraws from this vault when STRC dips.
 *         Users can also deposit USDC directly to fund the grid-buy.
 */
contract USDCVault is ERC4626 {
    using SafeERC20 for IERC20;

    IERC4626 public immutable tydro;

    constructor(
        IERC20 _usdc,
        IERC4626 _tydro
    ) ERC4626(_usdc) ERC20("xStocks USDC Vault", "xsUSDC") {
        tydro = _tydro;
        // Approve Tydro to spend our USDC (max approval for gas efficiency)
        _usdc.approve(address(_tydro), type(uint256).max);
    }

    /// @dev After receiving USDC from depositor, forward to Tydro for yield.
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override {
        // ERC4626 base pulls USDC from caller, mints shares to receiver
        super._deposit(caller, receiver, assets, shares);

        // Forward USDC to Tydro
        tydro.deposit(assets, address(this));
    }

    /// @dev Before sending USDC to withdrawer, pull from Tydro.
    function _withdraw(
        address caller,
        address receiver,
        address owner,
        uint256 assets,
        uint256 shares
    ) internal override {
        // Pull USDC from Tydro first
        tydro.withdraw(assets, address(this), address(this));

        // ERC4626 base burns shares from owner, sends USDC to receiver
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    /// @notice Total assets = USDC held by Tydro on our behalf + any USDC held directly.
    function totalAssets() public view override returns (uint256) {
        uint256 tydroShares = tydro.balanceOf(address(this));
        uint256 tydroAssets = tydroShares > 0 ? tydro.convertToAssets(tydroShares) : 0;
        uint256 directBalance = IERC20(asset()).balanceOf(address(this));
        return tydroAssets + directBalance;
    }
}

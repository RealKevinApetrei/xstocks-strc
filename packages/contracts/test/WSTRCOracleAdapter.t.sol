// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {wSTRC} from "../src/wSTRC.sol";
import {WSTRCOracleAdapter} from "../src/WSTRCOracleAdapter.sol";

contract MockSTRC is ERC20 {
    constructor() ERC20("STRCx", "STRCx") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract WSTRCOracleAdapterTest is Test {
    MockSTRC strc;
    wSTRC wrapper;
    WSTRCOracleAdapter oracle;

    uint256 constant INITIAL_PRICE = 105e18; // $105 in 18 decimals

    function setUp() public {
        strc = new MockSTRC();
        wrapper = new wSTRC(address(strc));
        // Deploy without Pyth (manual mode)
        oracle = new WSTRCOracleAdapter(
            address(wrapper),
            address(0),
            bytes32(0),
            INITIAL_PRICE
        );
    }

    function test_initial_price() public view {
        uint256 p = oracle.price();
        assertEq(p, INITIAL_PRICE * 1e24, "Initial price should be 105 * 1e24");
    }

    function test_price_after_rebase() public {
        strc.mint(address(this), 1000e18);
        strc.approve(address(wrapper), 1000e18);
        wrapper.wrap(1000e18);

        strc.mint(address(wrapper), 500e18);
        assertEq(wrapper.strcPerWstrc(), 1.5e18);

        uint256 p = oracle.price();
        uint256 expected = (1.5e18 * INITIAL_PRICE / 1e18) * 1e24;
        assertEq(p, expected, "Price should reflect exchange rate");
    }

    function test_manual_price_update() public {
        oracle.setManualPrice(110e18);
        (uint256 p,) = oracle.getStrcxPrice();
        assertEq(p, 110e18);
    }

    function test_only_owner_can_set_manual_price() public {
        vm.prank(address(0xdead));
        vm.expectRevert();
        oracle.setManualPrice(100e18);
    }

    function test_manual_override_active() public view {
        assertTrue(oracle.manualOverride());
        assertGt(oracle.price(), 0);
    }

    function test_no_pyth_reverts_without_manual() public {
        WSTRCOracleAdapter noManual = new WSTRCOracleAdapter(
            address(wrapper), address(1), bytes32(uint256(1)), 0
        );
        noManual.setManualOverride(false);
        vm.expectRevert(); // Reverts when calling fake Pyth address
        noManual.price();
    }

    function test_getStrcxPrice() public view {
        (uint256 p, uint256 ts) = oracle.getStrcxPrice();
        assertEq(p, INITIAL_PRICE);
        assertGt(ts, 0);
    }

    function testFuzz_price_with_exchange_rate(uint256 strcAmount) public {
        strcAmount = bound(strcAmount, 1e18, 1e30);
        strc.mint(address(this), strcAmount);
        strc.approve(address(wrapper), strcAmount);
        wrapper.wrap(strcAmount);
        strc.mint(address(wrapper), bound(strcAmount, 0, strcAmount));
        assertGt(oracle.price(), 0);
    }
}

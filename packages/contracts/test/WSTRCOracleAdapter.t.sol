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
        // Deploy without Chainlink verifier (manual mode)
        oracle = new WSTRCOracleAdapter(
            address(wrapper),
            address(0), // no verifier — manual mode
            bytes32(0),
            INITIAL_PRICE
        );
    }

    function test_initial_price() public view {
        // wSTRC rate is 1:1 initially, so price should be 105 * 1e24 (Morpho scale)
        uint256 p = oracle.price();
        assertEq(p, INITIAL_PRICE * 1e24, "Initial price should be 105 * 1e24");
    }

    function test_price_after_rebase() public {
        // Set up: wrap 1000 STRC
        strc.mint(address(this), 1000e18);
        strc.approve(address(wrapper), 1000e18);
        wrapper.wrap(1000e18);

        // Simulate rebase: +500 STRC (50% increase)
        strc.mint(address(wrapper), 500e18);

        // Exchange rate is now 1.5 STRC per wSTRC
        assertEq(wrapper.strcPerWstrc(), 1.5e18);

        // wSTRC price should be 105 * 1.5 = 157.5, scaled by 1e24 for Morpho
        // price() = (rate * strcxPriceUsd / 1e18) * 1e24
        // = (1.5e18 * 105e18 / 1e18) * 1e24 = 157.5e18 * 1e24 = 157.5e42
        uint256 p = oracle.price();
        uint256 expected = (1.5e18 * INITIAL_PRICE / 1e18) * 1e24;
        assertEq(p, expected, "Price should reflect exchange rate");
    }

    function test_manual_price_update() public {
        uint256 newPrice = 110e18; // $110
        oracle.setManualPrice(newPrice);

        (uint256 p, uint256 ts) = oracle.getStrcxPrice();
        assertEq(p, newPrice);
        assertEq(ts, block.timestamp);
    }

    function test_only_owner_can_set_manual_price() public {
        vm.prank(address(0xdead));
        vm.expectRevert();
        oracle.setManualPrice(100e18);
    }

    function test_stale_price_reverts_in_chainlink_mode() public {
        // Deploy with a verifier address (non-manual mode)
        WSTRCOracleAdapter chainlinkOracle = new WSTRCOracleAdapter(
            address(wrapper),
            address(1), // fake verifier
            bytes32(uint256(1)),
            INITIAL_PRICE
        );

        // Fast forward past MAX_PRICE_AGE
        vm.warp(block.timestamp + 3601);

        vm.expectRevert("Oracle: price stale");
        chainlinkOracle.price();
    }

    function test_manual_override_bypasses_staleness() public {
        // Even if price is old, manual override should work
        assertTrue(oracle.manualOverride());

        vm.warp(block.timestamp + 7200); // 2 hours later
        // Should not revert because manualOverride is true
        uint256 p = oracle.price();
        assertGt(p, 0);
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

        // Simulate random rebase
        uint256 rebaseAmount = bound(strcAmount, 0, strcAmount);
        strc.mint(address(wrapper), rebaseAmount);

        uint256 p = oracle.price();
        assertGt(p, 0, "Price should always be positive");
    }
}

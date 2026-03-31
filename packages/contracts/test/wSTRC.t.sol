// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {wSTRC} from "../src/wSTRC.sol";

/// @dev Mock rebasing STRC token (balances change via direct transfer to simulate rebase)
contract MockSTRC is ERC20 {
    constructor() ERC20("Structure", "STRC") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract wSTRCTest is Test {
    MockSTRC strc;
    wSTRC wrapper;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        strc = new MockSTRC();
        wrapper = new wSTRC(address(strc));
    }

    function test_wrap_unwrap_roundtrip() public {
        uint256 amount = 1000e18;
        strc.mint(alice, amount);

        vm.startPrank(alice);
        strc.approve(address(wrapper), amount);
        uint256 wstrcAmount = wrapper.wrap(amount);
        assertEq(wstrcAmount, amount, "First wrap should be 1:1");

        uint256 strcBack = wrapper.unwrap(wstrcAmount);
        assertEq(strcBack, amount, "Roundtrip should return same amount");
        assertEq(strc.balanceOf(alice), amount, "Alice should have STRC back");
        assertEq(wrapper.balanceOf(alice), 0, "Alice should have no wSTRC");
        vm.stopPrank();
    }

    function test_exchange_rate_after_rebase() public {
        uint256 amount = 1000e18;
        strc.mint(alice, amount);

        vm.startPrank(alice);
        strc.approve(address(wrapper), amount);
        wrapper.wrap(amount);
        vm.stopPrank();

        // Simulate rebase: STRC balance doubles (transfer more STRC to wrapper)
        strc.mint(address(wrapper), 1000e18);

        // Exchange rate should now be 2:1 (2000 STRC / 1000 wSTRC)
        assertEq(wrapper.strcPerWstrc(), 2e18, "Rate should be 2 after rebase");

        // Unwrap should give 2x
        vm.prank(alice);
        uint256 strcBack = wrapper.unwrap(1000e18);
        assertEq(strcBack, 2000e18, "Should receive 2x STRC after rebase");
    }

    function test_multiple_users_fair_share() public {
        // Alice wraps 1000 STRC
        strc.mint(alice, 1000e18);
        vm.startPrank(alice);
        strc.approve(address(wrapper), 1000e18);
        wrapper.wrap(1000e18);
        vm.stopPrank();

        // Rebase: +500 STRC (50% increase)
        strc.mint(address(wrapper), 500e18);

        // Bob wraps 1500 STRC (at new rate: 1500 STRC / 1.5 rate = 1000 wSTRC)
        strc.mint(bob, 1500e18);
        vm.startPrank(bob);
        strc.approve(address(wrapper), 1500e18);
        uint256 bobWstrc = wrapper.wrap(1500e18);
        vm.stopPrank();

        assertEq(bobWstrc, 1000e18, "Bob should get 1000 wSTRC at 1.5 rate");

        // Total: 3000 STRC, 2000 wSTRC, rate = 1.5
        // Alice unwraps 1000 wSTRC → should get 1500 STRC (her share of the rebase)
        vm.prank(alice);
        uint256 aliceStrc = wrapper.unwrap(1000e18);
        assertEq(aliceStrc, 1500e18, "Alice gets proportional share");

        // Bob unwraps 1000 wSTRC → should get 1500 STRC
        vm.prank(bob);
        uint256 bobStrc = wrapper.unwrap(1000e18);
        assertEq(bobStrc, 1500e18, "Bob gets proportional share");
    }

    function test_wrap_zero_reverts() public {
        vm.prank(alice);
        vm.expectRevert("wSTRC: wrap zero");
        wrapper.wrap(0);
    }

    function test_unwrap_more_than_balance_reverts() public {
        vm.prank(alice);
        vm.expectRevert("wSTRC: insufficient balance");
        wrapper.unwrap(1e18);
    }

    function test_initial_rate_is_one() public view {
        assertEq(wrapper.strcPerWstrc(), 1e18, "Initial rate should be 1:1");
    }

    function testFuzz_wrap_unwrap(uint256 amount) public {
        amount = bound(amount, 1, 1e30);
        strc.mint(alice, amount);

        vm.startPrank(alice);
        strc.approve(address(wrapper), amount);
        uint256 wstrcAmount = wrapper.wrap(amount);
        assertGt(wstrcAmount, 0, "Should mint some wSTRC");

        uint256 strcBack = wrapper.unwrap(wstrcAmount);
        // Allow 1 wei rounding error
        assertApproxEqAbs(strcBack, amount, 1, "Roundtrip should be ~equal");
        vm.stopPrank();
    }
}

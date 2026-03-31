// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";

interface IMorpho {
    struct MarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        address irm;
        uint256 lltv;
    }
    function createMarket(MarketParams calldata marketParams) external;
    function supply(MarketParams calldata marketParams, uint256 assets, uint256 shares, address onBehalf, bytes calldata data) external returns (uint256, uint256);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
}

contract CreateMarket is Script {

    address constant MORPHO = 0x857f3EefE8cbda3Bc49367C996cd664A880d3042;
    address constant IRM    = 0x9515407b1512F53388ffE699524100e7270Ee57B;
    address constant WSTRC  = 0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281;
    address constant USDC   = 0x2D270e6886d130D724215A266106e6832161EAEd;
    uint256 constant LLTV   = 860000000000000000; // 86%

    // New oracle — PythOracleAdapter with 7-day maxStaleness
    address constant ORACLE = 0xDf50EF4D86f056546208c66F9d348b003605eb8E;

    function run() external {
        IMorpho.MarketParams memory params = IMorpho.MarketParams({
            loanToken:       USDC,
            collateralToken: WSTRC,
            oracle:          ORACLE,
            irm:             IRM,
            lltv:            LLTV
        });

        vm.startBroadcast();

        IMorpho(MORPHO).createMarket(params);

        // Seed USDC liquidity if USDC_SEED_AMOUNT env var is set
        uint256 seedAmount = vm.envOr("USDC_SEED_AMOUNT", uint256(0));
        if (seedAmount > 0) {
            IERC20(USDC).approve(MORPHO, seedAmount);
            IMorpho(MORPHO).supply(params, seedAmount, 0, msg.sender, "");
            console.log("USDC seeded:", seedAmount);
        }

        vm.stopBroadcast();

        bytes32 marketId = keccak256(abi.encode(params));
        console.log("=== MARKET CREATED ===");
        console.log("Oracle:   ", ORACLE);
        console.log("LLTV:      86%");
        console.log("Market ID:");
        console.logBytes32(marketId);
    }
}

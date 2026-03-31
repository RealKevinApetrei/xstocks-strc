// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Batcher} from "../src/Batcher.sol";

/**
 * Deploy Batcher for the active wSTRC/USDC market.
 *
 * Uses the new PythOracleAdapter (7-day maxStaleness) and 86% LLTV
 * to match the active Morpho market.
 *
 * Run:
 *   forge script script/DeployBatcher.s.sol \
 *     --rpc-url https://rpc-gel.inkonchain.com \
 *     --broadcast \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     -vvvv
 */
contract DeployBatcher is Script {

    // ─── Active market params (must match exactly) ────────────────────────────
    address constant STRC   = 0x1Aad217B8F78dbA5E6693460e8470F8b1A3977f3;
    address constant WSTRC  = 0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281;
    address constant USDC   = 0x2D270e6886d130D724215A266106e6832161EAEd;
    address constant MORPHO = 0x857f3EefE8cbda3Bc49367C996cd664A880d3042;
    address constant ORACLE = 0xDf50EF4D86f056546208c66F9d348b003605eb8E; // PythOracleAdapter 7-day
    address constant IRM    = 0x9515407b1512F53388ffE699524100e7270Ee57B;
    uint256 constant LLTV   = 860000000000000000; // 86%

    function run() external {
        vm.startBroadcast();

        Batcher batcher = new Batcher(
            STRC,
            WSTRC,
            USDC,
            MORPHO,
            ORACLE,
            IRM,
            LLTV
        );

        vm.stopBroadcast();

        console.log("=== BATCHER DEPLOYED ===");
        console.log("Batcher:", address(batcher));
        console.log("Oracle: ", ORACLE);
        console.log("LLTV:    86%");
        console.log("Market ID:", batcher.getMarketId());
    }
}

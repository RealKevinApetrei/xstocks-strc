// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {PythOracleAdapter} from "../src/PythOracleAdapter.sol";

/**
 * Redeploy PythOracleAdapter with 7-day maxStaleness.
 *
 * WHY: maxStaleness = 86400 (24h) caused reverts on weekends and late evenings
 * because Pyth only updates STRC/USD during NYSE market hours.
 * 7 days means the oracle uses last-known price (Friday close) during afterhours —
 * safe for a lending protocol since collateral value doesn't change when markets close.
 *
 * Run:
 *   forge script script/DeployPythOracle.s.sol \
 *     --rpc-url https://rpc-gel.inkonchain.com \
 *     --broadcast \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     -vvvv
 *
 * Then:
 *   1. Take the printed oracle address
 *   2. Run CreateMarket.s.sol with ORACLE_ADDRESS = new address
 *   3. Update ORACLE_ADDRESS in the admin UI
 *   4. Seed the new market with USDC
 */
contract DeployPythOracle is Script {

    address constant PYTH    = 0x2880aB155794e7179c9eE2e38200202908C17B43;
    address constant WSTRC   = 0x3b172e9c5488B17A0F4dc6fF4dc798055CC77281;

    bytes32 constant STRC_FEED_ID   = 0x27c7bbc9755d847f7fc63620c2edcc6a91d2c0c67a28c7999907b59c505b3c17;
    uint256 constant MAX_STALENESS  = 604800; // 7 days — works through weekends + afterhours

    function run() external {
        vm.startBroadcast();

        PythOracleAdapter oracle = new PythOracleAdapter(
            PYTH,
            WSTRC,
            STRC_FEED_ID,
            MAX_STALENESS
        );

        vm.stopBroadcast();

        console.log("=== PYTH ORACLE REDEPLOYED ===");
        console.log("PythOracleAdapter:", address(oracle));
        console.log("maxStaleness:      7 days (604800s)");
        console.log("");
        console.log("NEXT: run CreateMarket.s.sol with ORACLE_ADDRESS =", address(oracle));
    }
}

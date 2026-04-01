// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {wSTRC} from "../src/wSTRC.sol";
import {PythOracleAdapter} from "../src/PythOracleAdapter.sol";
import {Batcher} from "../src/Batcher.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * Deploy the Spreads leverage product contracts to INK mainnet.
 *
 * Deploys: wSTRC → PythOracleAdapter → Batcher
 *
 * Required env vars:
 *   STRC_ADDRESS    = 0x1Aad217B8F78dbA5E6693460e8470F8b1A3977f3
 *   USDC_ADDRESS    = 0x2D270e6886d130D724215A266106e6832161EAEd
 *
 * Run:
 *   forge script script/DeployLeverage.s.sol \
 *     --rpc-url https://rpc-gel.inkonchain.com \
 *     --broadcast \
 *     --private-key $DEPLOYER_PRIVATE_KEY
 */
contract DeployLeverage is Script {

    // INK mainnet constants
    address constant PYTH    = 0x2880aB155794e7179c9eE2e38200202908C17B43;
    address constant MORPHO  = 0x857f3EefE8cbda3Bc49367C996cd664A880d3042;
    address constant IRM     = 0x9515407b1512F53388ffE699524100e7270Ee57B;

    bytes32 constant STRC_FEED_ID  = 0x27c7bbc9755d847f7fc63620c2edcc6a91d2c0c67a28c7999907b59c505b3c17;
    uint256 constant MAX_STALENESS = 86400; // 24h — reverts on weekends
    uint256 constant LLTV          = 800000000000000000; // 80%

    function run() external {
        address strc = vm.envAddress("STRC_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast();

        // 1. Deploy wSTRC wrapper
        wSTRC wrapper = new wSTRC(strc);
        console.log("wSTRC:   ", address(wrapper));

        // 2. Deploy Pyth oracle adapter
        PythOracleAdapter oracle = new PythOracleAdapter(
            PYTH,
            address(wrapper),
            STRC_FEED_ID,
            MAX_STALENESS
        );
        console.log("Oracle:  ", address(oracle));

        // 3. Deploy Batcher
        Batcher batcher = new Batcher(
            strc,
            address(wrapper),
            usdc,
            MORPHO,
            address(oracle),
            IRM,
            LLTV
        );
        console.log("Batcher: ", address(batcher));

        vm.stopBroadcast();

        console.log("");
        console.log("=== LEVERAGE PRODUCT DEPLOYED ===");
        console.log("wSTRC:   ", address(wrapper));
        console.log("Oracle:  ", address(oracle));
        console.log("Batcher: ", address(batcher));
        console.log("");
        console.log("Next: run CreateMarket.s.sol to create the Morpho market");
    }
}

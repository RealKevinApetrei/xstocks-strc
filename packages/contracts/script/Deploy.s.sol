// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {wSTRC} from "../src/wSTRC.sol";
import {WSTRCOracleAdapter} from "../src/WSTRCOracleAdapter.sol";
import {USDCVault} from "../src/USDCVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

contract Deploy is Script {
    function run() external {
        address strc = vm.envAddress("STRC_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address tydro = vm.envAddress("TYDRO_VAULT_ADDRESS");
        address pythContract = vm.envOr("PYTH_CONTRACT_ADDRESS", address(0));
        bytes32 pythFeedId = vm.envOr("PYTH_PRICE_FEED_ID", bytes32(0));
        uint256 initialStrcxPrice = vm.envUint("INITIAL_STRCX_PRICE"); // 18 decimals

        vm.startBroadcast();

        wSTRC wrapper = new wSTRC(strc);
        console.log("wSTRC deployed at:", address(wrapper));

        WSTRCOracleAdapter oracle = new WSTRCOracleAdapter(
            address(wrapper),
            pythContract,
            pythFeedId,
            initialStrcxPrice
        );
        console.log("Oracle deployed at:", address(oracle));

        USDCVault vault = new USDCVault(IERC20(usdc), IERC4626(tydro));
        console.log("USDC Vault deployed at:", address(vault));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("wSTRC:       ", address(wrapper));
        console.log("Oracle:      ", address(oracle));
        console.log("USDC Vault:  ", address(vault));
        console.log("Pyth Contract:", pythContract);
        console.log("");
        console.log("Next steps:");
        console.log("1. Create Morpho market with wSTRC as collateral");
        console.log("2. Set addresses in .env");
        console.log("3. Start backend Pyth price updater");
    }
}

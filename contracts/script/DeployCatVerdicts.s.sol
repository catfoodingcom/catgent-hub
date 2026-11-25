// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CatVerdicts} from "../src/CatVerdicts.sol";

/// Deploy CatVerdicts on BNB Smart Chain testnet (hackathon, 25 Nov 2026).
///   set -a; . ./.env.bnb-testnet; set +a
///   forge script script/DeployCatVerdicts.s.sol --rpc-url bsc_testnet --broadcast
/// The testnet key is owner and attester. Atlas's signer is the official one from Atlas's own consumer
/// library (PullOracleReferenceHooks); the owner can rotate it (setAtlasSigner).
contract DeployCatVerdicts is Script {
    address constant ATLAS_SIGNER = 0x59eD4701224fD9e2a85Ef2946c2ab828C1dDC600;

    function run() external returns (CatVerdicts v) {
        require(block.chainid == 97, "BSC testnet only");
        uint256 key = vm.envUint("BNB_TEST_KEY");
        address me = vm.addr(key);
        address[] memory signers = new address[](1);
        signers[0] = vm.envOr("ATLAS_SIGNER", ATLAS_SIGNER);
        vm.startBroadcast(key);
        // price rule 1% (100 bps); a signed price may be at most 5 minutes old
        v = new CatVerdicts(me, me, signers, 100, 300);
        vm.stopBroadcast();
        console.log("CatVerdicts", address(v));
        console.log("owner/attester", me);
        console.log("atlas signer", signers[0]);
    }
}

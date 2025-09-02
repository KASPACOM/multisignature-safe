// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.9.0;

import {Script, console} from "forge-std/Script.sol";

// Import all Safe contracts
import {SafeL2} from "../src/SafeL2.sol";
import {SafeProxyFactory} from "../src/proxies/SafeProxyFactory.sol";

// Libraries
import {CreateCall} from "../src/libraries/CreateCall.sol";
import {MultiSend} from "../src/libraries/MultiSend.sol";
import {MultiSendCallOnly} from "../src/libraries/MultiSendCallOnly.sol";
import {SignMessageLib} from "../src/libraries/SignMessageLib.sol";

import {CompatibilityFallbackHandler} from "../src/handler/CompatibilityFallbackHandler.sol";
import {SimulateTxAccessor} from "../src/accessors/SimulateTxAccessor.sol";

contract DeployBase is Script {
    function run() public {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        SafeL2 safeSingleton = new SafeL2();
        SafeProxyFactory factory = new SafeProxyFactory();
        CompatibilityFallbackHandler handler = new CompatibilityFallbackHandler();

        // optional
        MultiSend multiSend = new MultiSend();
        MultiSendCallOnly multiSendCallOnly = new MultiSendCallOnly();
        CreateCall createCall = new CreateCall();
        SignMessageLib signMessageLib = new SignMessageLib();
        SimulateTxAccessor simulateTxAccessor = new SimulateTxAccessor();

        console.log("SafeL2 singleton:", address(safeSingleton));
        console.log("SafeProxyFactory:", address(factory));
        console.log("CompatibilityFallbackHandler:", address(handler));
        console.log("MultiSend:", address(multiSend));
        console.log("MultiSendCallOnly:", address(multiSendCallOnly));
        console.log("CreateCall:", address(createCall));
        console.log("SignMessageLib:", address(signMessageLib));
        console.log("SimulateTxAccessor:", address(simulateTxAccessor));

        vm.stopBroadcast();
    }
}
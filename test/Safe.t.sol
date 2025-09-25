// test/SafeE2E.t.sol
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SafeL2} from "safe-smart-account/SafeL2.sol";
import {Safe} from "safe-smart-account/Safe.sol";
import {SafeProxyFactory} from "safe-smart-account/proxies/SafeProxyFactory.sol";
import {SafeProxy} from "safe-smart-account/proxies/SafeProxy.sol";
import {CompatibilityFallbackHandler} from "safe-smart-account/handler/CompatibilityFallbackHandler.sol";
import {Counter} from "./Counter.sol";
import {Enum} from "safe-smart-account/common/Enum.sol";

contract SafeE2E is Test {
    uint256 internal ownerPk;
    address internal owner;

    SafeL2 internal safeSingleton;
    SafeProxyFactory internal factory;
    CompatibilityFallbackHandler internal handler;

    Safe internal safe;
    Counter internal target;

    function setUp() public {
        ownerPk = 0xA11CE;
        owner = vm.addr(ownerPk);

        safeSingleton = new SafeL2();
        factory = new SafeProxyFactory();
        handler = new CompatibilityFallbackHandler();

        address[] memory owners = new address[](1);
        owners[0] = owner;

        bytes memory initializer = abi.encodeWithSignature(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)",
            owners,
            1,
            address(0),
            bytes(""),
            address(handler),
            address(0),
            0,
            address(0)
        );

        SafeProxy proxy = factory.createProxyWithNonce(
            address(safeSingleton),
            initializer,
            0
        );

        safe = Safe(payable(address(proxy)));
        target = new Counter();
    }

    function test_execTransaction_singleSig() public {
        bytes memory data = abi.encodeWithSignature("set(uint256)", 42);

        bytes32 txHash = safe.getTransactionHash(
            address(target),
            0,
            data,
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            address(0),
            safe.nonce()
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, txHash);

        bytes memory sig = abi.encodePacked(r, s, v);

        bool success = safe.execTransaction(
            address(target),
            0,
            data,
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            sig
        );
        assertTrue(success, "execTransaction failed");

        assertEq(target.value(), 42, "target value mismatch");
    }
}

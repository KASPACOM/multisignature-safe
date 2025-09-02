// test/SafeE2E.t.sol
// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import {SafeL2} from "../src/SafeL2.sol";
import {Safe} from "../src/Safe.sol";
import {SafeProxyFactory} from "../src/proxies/SafeProxyFactory.sol";
import {SafeProxy} from "../src/proxies/SafeProxy.sol";
import {CompatibilityFallbackHandler} from "../src/handler/CompatibilityFallbackHandler.sol";
import {ExampleTarget} from "./Set.sol";
import {Enum} from "../src/libraries/Enum.sol";

contract SafeE2E is Test {
    uint256 internal ownerPk;
    address internal owner;

    SafeL2 internal safeSingleton;
    SafeProxyFactory internal factory;
    CompatibilityFallbackHandler internal handler;

    Safe internal safe; // ABI для прокси
    ExampleTarget internal target;

    function setUp() public {
        // генерим владельца
        ownerPk = 0xA11CE; // произвольно для теста
        owner = vm.addr(ownerPk);

        // деплоим базу
        safeSingleton = new SafeL2();
        factory = new SafeProxyFactory();
        handler = new CompatibilityFallbackHandler();

        // создаём Safe-proxy c владельцем owner и threshold=1
        address[] memory owners = new address[](1);
        owners[0] = owner;

        bytes memory initializer = abi.encodeWithSignature(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)",
            owners,
            1,                  // threshold
            address(0),
            bytes(""),
            address(handler),   // fallbackHandler
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
        target = new ExampleTarget();
    }

    function test_execTransaction_singleSig() public {
        // готовим call на target.set(42)
        address to = address(target);
        uint256 value = 0;
        bytes memory data = abi.encodeWithSignature("set(uint256)", 42);
        Enum.Operation operation = Enum.Operation.Call;
        uint256 safeTxGas = 0;    // можно 0: Safe сам оценит
        uint256 baseGas = 0;
        uint256 gasPrice = 0;
        address gasToken = address(0);
        address refundReceiver = address(0);
        uint256 nonce = safe.nonce();

        // считаем хэш
        bytes32 txHash = safe.getTransactionHash(
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver,
            nonce
        );

        // подписываем владельцем
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, txHash);

        // формат подписи: r(32) + s(32) + v(1)
        bytes memory sig = abi.encodePacked(r, s, v);

        // выполняем
        bool success = safe.execTransaction(
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            payable(refundReceiver),
            sig
        );
        assertTrue(success, "execTransaction failed");

        // проверяем эффект
        assertEq(target.value(), 42, "target value mismatch");
    }
}

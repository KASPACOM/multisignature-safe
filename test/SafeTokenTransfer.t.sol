// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.9.0;

import "forge-std/Test.sol";
import {SafeL2} from "../src/SafeL2.sol";
import {Safe} from "../src/Safe.sol";
import {SafeProxyFactory} from "../src/proxies/SafeProxyFactory.sol";
import {SafeProxy} from "../src/proxies/SafeProxy.sol";
import {CompatibilityFallbackHandler} from "../src/handler/CompatibilityFallbackHandler.sol";
import {MockERC20} from "./MockERC20.sol";
import {Enum} from "../src/libraries/Enum.sol";

contract SafeTokenTransferTest is Test {
    // 5 owners with private keys
    uint256[5] internal ownerPks;
    address[5] internal owners;
    
    // Recipients for token transfer
    address internal recipient1;
    address internal recipient2;
    
    SafeL2 internal safeSingleton;
    SafeProxyFactory internal factory;
    CompatibilityFallbackHandler internal handler;
    
    Safe internal safe; // ABI для прокси
    MockERC20 internal token;
    
    function setUp() public {
        // Генерируем 5 владельцев
        ownerPks[0] = 0xA11CE;
        ownerPks[1] = 0xB0B;
        ownerPks[2] = 0xCAFE;
        ownerPks[3] = 0xDEAD;
        ownerPks[4] = 0xBEEF;
        
        for (uint i = 0; i < 5; i++) {
            owners[i] = vm.addr(ownerPks[i]);
        }
        
        // Сортируем владельцев по адресам (Safe требует отсортированный массив)
        _sortOwners();
        
        // Генерируем получателей токенов
        recipient1 = makeAddr("recipient1");
        recipient2 = makeAddr("recipient2");
        
        // Деплоим контракты
        safeSingleton = new SafeL2();
        factory = new SafeProxyFactory();
        handler = new CompatibilityFallbackHandler();
        token = new MockERC20("Test Token", "TST");
        
        // Создаём массив владельцев для инициализации
        address[] memory sortedOwners = new address[](5);
        for (uint i = 0; i < 5; i++) {
            sortedOwners[i] = owners[i];
        }
        
        // Создаём Safe-proxy с threshold=3 (3 из 5)
        bytes memory initializer = abi.encodeWithSignature(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)",
            sortedOwners,
            3,                  // threshold = 3
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
        
        // Минтим токены Safe'у для тестирования
        token.mint(address(safe), 10000 * 10**18); // 10,000 tokens
        
        // Минтим токены получателям для проверки исходных балансов
        token.mint(recipient1, 100 * 10**18);
        token.mint(recipient2, 200 * 10**18);
    }
    
    function test_tokenTransfer_3of5_multisig() public {
        uint256 transferAmount = 1000 * 10**18; // 1000 tokens
        
        // Проверяем исходные балансы
        assertEq(token.balanceOf(address(safe)), 10000 * 10**18, "Safe should have 10000 tokens");
        assertEq(token.balanceOf(recipient1), 100 * 10**18, "Recipient1 should have 100 tokens initially");
        
        // Готовим транзакцию для перевода токенов
        address to = address(token);
        uint256 value = 0;
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", recipient1, transferAmount);
        Enum.Operation operation = Enum.Operation.Call;
        uint256 safeTxGas = 0;
        uint256 baseGas = 0;
        uint256 gasPrice = 0;
        address gasToken = address(0);
        address refundReceiver = address(0);
        uint256 nonce = safe.nonce();
        
        // Считаем хэш транзакции
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
        
        // Получаем подписи от первых 3 владельцев (по порядку адресов)
        bytes memory signatures = _getOrderedSignatures(txHash, 3);
        
        // Проверяем что у нас действительно 3 из 5 владельцев
        assertEq(safe.getThreshold(), 3, "Threshold should be 3");
        assertEq(safe.getOwners().length, 5, "Should have 5 owners");
        
        // Выполняем транзакцию
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
            signatures
        );
        
        assertTrue(success, "Token transfer transaction failed");
        
        // Проверяем результат перевода
        assertEq(token.balanceOf(address(safe)), 9000 * 10**18, "Safe should have 9000 tokens after transfer");
        assertEq(token.balanceOf(recipient1), 1100 * 10**18, "Recipient1 should have 1100 tokens after transfer");
    }
    
    function test_tokenTransfer_multipleRecipients_3of5() public {
        uint256 amount1 = 500 * 10**18; // 500 tokens to recipient1
        uint256 amount2 = 300 * 10**18; // 300 tokens to recipient2
        
        // Проверяем исходные балансы
        uint256 balanceBefore1 = token.balanceOf(recipient1);
        uint256 balanceBefore2 = token.balanceOf(recipient2);
        assertEq(balanceBefore1, 100 * 10**18, "Recipient1 initial balance");
        assertEq(balanceBefore2, 200 * 10**18, "Recipient2 initial balance");
        
        // Первый перевод на recipient1
        _executeTokenTransfer(recipient1, amount1);
        
        // Второй перевод на recipient2
        _executeTokenTransfer(recipient2, amount2);
        
        // Проверяем финальные балансы
        assertEq(token.balanceOf(address(safe)), 9200 * 10**18, "Safe should have 9200 tokens after both transfers");
        assertEq(token.balanceOf(recipient1), balanceBefore1 + amount1, "Recipient1 should have 600 tokens");
        assertEq(token.balanceOf(recipient2), balanceBefore2 + amount2, "Recipient2 should have 500 tokens");
    }
    
    function test_tokenTransfer_insufficient_signatures() public {
        uint256 transferAmount = 1000 * 10**18;
        
        // Готовим транзакцию
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", recipient1, transferAmount);
        bytes32 txHash = safe.getTransactionHash(
            address(token),
            0,
            data,
            Enum.Operation.Call,
            0, 0, 0, address(0), address(0),
            safe.nonce()
        );
        
        // Получаем только 2 подписи вместо требуемых 3
        bytes memory insufficientSigs = _getOrderedSignatures(txHash, 2);
        
        // Попытка выполнения должна провалиться
        vm.expectRevert();
        safe.execTransaction(
            address(token),
            0,
            data,
            Enum.Operation.Call,
            0, 0, 0, address(0),
            payable(address(0)),
            insufficientSigs
        );
    }
    
    // Вспомогательная функция для выполнения перевода токенов
    function _executeTokenTransfer(address recipient, uint256 amount) internal {
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", recipient, amount);
        bytes32 txHash = safe.getTransactionHash(
            address(token),
            0,
            data,
            Enum.Operation.Call,
            0, 0, 0, address(0), address(0),
            safe.nonce()
        );
        
        bytes memory signatures = _getOrderedSignatures(txHash, 3);
        
        bool success = safe.execTransaction(
            address(token),
            0,
            data,
            Enum.Operation.Call,
            0, 0, 0, address(0),
            payable(address(0)),
            signatures
        );
        
        assertTrue(success, "Token transfer should succeed");
    }
    
    // Получаем подписи в правильном порядке (по возрастанию адресов владельцев)
    function _getOrderedSignatures(bytes32 txHash, uint256 sigCount) internal view returns (bytes memory) {
        bytes memory signatures = "";
        
        for (uint256 i = 0; i < sigCount; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPks[i], txHash);
            signatures = abi.encodePacked(signatures, r, s, v);
        }
        
        return signatures;
    }
    
    // Сортируем владельцев по адресам для корректной работы Safe
    function _sortOwners() internal {
        // Bubble sort for simplicity (только для тестов)
        for (uint i = 0; i < 5 - 1; i++) {
            for (uint j = 0; j < 5 - i - 1; j++) {
                if (owners[j] > owners[j + 1]) {
                    // Меняем местами адреса
                    address tempAddr = owners[j];
                    owners[j] = owners[j + 1];
                    owners[j + 1] = tempAddr;
                    
                    // Меняем местами приватные ключи
                    uint256 tempPk = ownerPks[j];
                    ownerPks[j] = ownerPks[j + 1];
                    ownerPks[j + 1] = tempPk;
                }
            }
        }
    }
}

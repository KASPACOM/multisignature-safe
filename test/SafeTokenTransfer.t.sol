// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0 <0.9.0;
pragma abicoder v2;

import "forge-std/Test.sol";
import {SafeL2} from "safe-smart-account/SafeL2.sol";
import {Safe} from "safe-smart-account/Safe.sol";
import {SafeProxyFactory} from "safe-smart-account/proxies/SafeProxyFactory.sol";
import {SafeProxy} from "safe-smart-account/proxies/SafeProxy.sol";
import {CompatibilityFallbackHandler} from "safe-smart-account/handler/CompatibilityFallbackHandler.sol";
import {MockERC20} from "./MockERC20.sol";
import {Enum} from "safe-smart-account/common/Enum.sol";
import {DeployBase} from "../script/DeploySafe.s.sol";

contract SafeTokenTransferTest is Test {
    uint256[3] internal ownerPks;
    address[3] internal owners;

    SafeL2 internal safeSingleton;
    SafeProxyFactory internal factory;
    CompatibilityFallbackHandler internal handler;

    Safe internal safe;
    MockERC20 internal token;

    function setUp() public {
        ownerPks[0] = 0xA11CE;
        ownerPks[1] = 0xB11CE;
        ownerPks[2] = 0xC11CE;
        owners[0] = vm.addr(ownerPks[0]);
        owners[1] = vm.addr(ownerPks[1]);
        owners[2] = vm.addr(ownerPks[2]);

        _sortOwners();

        safeSingleton = new SafeL2();
        factory = new SafeProxyFactory();
        handler = new CompatibilityFallbackHandler();
        token = new MockERC20("Test Token", "TST");

        address[] memory sortedOwners = new address[](3);
        for (uint i = 0; i < 3; i++) {
            sortedOwners[i] = owners[i];
            token.mint(owners[i], 100000 * 10 ** 18);
        }

        bytes memory initializer = abi.encodeWithSignature(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)",
            sortedOwners,
            2,
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

        token.mint(address(safe), 10000 * 10 ** 18); // 10,000 tokens
    }

    function test_tokenTransfer_2of3_multisig() public {
        uint256 transferAmount = 1000 * 10 ** 18; // 1000 tokens

        assertEq(
            token.balanceOf(address(safe)),
            10000 * 10 ** 18,
            "Safe should have 10000 tokens"
        );

        address to = address(token);
        bytes memory data = abi.encodeWithSignature(
            "transfer(address,uint256)",
            owners[0],
            transferAmount
        );
        uint256 balanceBefore = token.balanceOf(address(owners[0]));

        bytes32 txHash = safe.getTransactionHash(
            to,
            0,
            data,
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            safe.nonce()
        );

        bytes memory signatures = _getOrderedSignatures(txHash, 2);

        assertEq(safe.getThreshold(), 2, "Threshold should be 2");
        assertEq(safe.getOwners().length, 3, "Should have 3 owners");

        bool success = safe.execTransaction(
            to,
            0,
            data,
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            signatures
        );

        assertTrue(success, "Token transfer transaction failed");

        assertEq(
            token.balanceOf(address(safe)),
            9000 * 10 ** 18,
            "Safe should have 9000 tokens after transfer"
        );
        assertEq(
            token.balanceOf(owners[0]),
            balanceBefore + transferAmount,
            "Recipient1 should have 1100 tokens after transfer"
        );
    }

    function test_tokenTransfer_multipleRecipients_2of3() public {
        uint256 amount1 = 500 * 10 ** 18; // 500 tokens to recipient1
        uint256 amount2 = 300 * 10 ** 18; // 300 tokens to recipient2

        uint256 balanceBefore1 = token.balanceOf(owners[0]);
        uint256 balanceBefore2 = token.balanceOf(owners[1]);

        _executeTokenTransfer(owners[0], amount1);

        _executeTokenTransfer(owners[1], amount2);

        assertEq(
            token.balanceOf(address(safe)),
            9200 * 10 ** 18,
            "Safe should have 9200 tokens after both transfers"
        );
        assertEq(
            token.balanceOf(owners[0]),
            balanceBefore1 + amount1,
            "Recipient1 should have 600 tokens"
        );
        assertEq(
            token.balanceOf(owners[1]),
            balanceBefore2 + amount2,
            "Recipient2 should have 500 tokens"
        );
    }

    function test_tokenTransfer_insufficient_signatures() public {
        uint256 transferAmount = 1000 * 10 ** 18;

        bytes memory data = abi.encodeWithSignature(
            "transfer(address,uint256)",
            owners[0],
            transferAmount
        );
        bytes32 txHash = safe.getTransactionHash(
            address(token),
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

        bytes memory insufficientSigs = _getOrderedSignatures(txHash, 1);

        vm.expectRevert();
        safe.execTransaction(
            address(token),
            0,
            data,
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            insufficientSigs
        );
    }

    function _executeTokenTransfer(address recipient, uint256 amount) internal {
        bytes memory data = abi.encodeWithSignature(
            "transfer(address,uint256)",
            recipient,
            amount
        );
        bytes32 txHash = safe.getTransactionHash(
            address(token),
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

        bytes memory signatures = _getOrderedSignatures(txHash, 2);

        bool success = safe.execTransaction(
            address(token),
            0,
            data,
            Enum.Operation.Call,
            0,
            0,
            0,
            address(0),
            payable(address(0)),
            signatures
        );

        assertTrue(success, "Token transfer should succeed");
    }

    function _getOrderedSignatures(
        bytes32 txHash,
        uint256 sigCount
    ) internal view returns (bytes memory) {
        bytes memory signatures = "";

        for (uint256 i = 0; i < sigCount; i++) {
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPks[i], txHash);
            signatures = abi.encodePacked(signatures, r, s, v);
        }

        return signatures;
    }

    function _sortOwners() internal {
        for (uint i = 0; i < 3 - 1; i++) {
            for (uint j = 0; j < 3 - i - 1; j++) {
                if (owners[j] > owners[j + 1]) {
                    address tempAddr = owners[j];
                    owners[j] = owners[j + 1];
                    owners[j + 1] = tempAddr;

                    uint256 tempPk = ownerPks[j];
                    ownerPks[j] = ownerPks[j + 1];
                    ownerPks[j + 1] = tempPk;
                }
            }
        }
    }
}

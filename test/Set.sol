// src/examples/ExampleTarget.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ExampleTarget {
    uint256 public value;
    event ValueSet(uint256 v, address caller);

    function set(uint256 v) external {
        value = v;
        emit ValueSet(v, msg.sender);
    }
}

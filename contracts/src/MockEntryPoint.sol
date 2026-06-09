// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title MockEntryPoint — Minimal EntryPoint mock for testing VerifyingPaymaster
contract MockEntryPoint {
    mapping(address => uint256) public balances;

    // Minimal UserOperation struct matching EntryPoint v0.8 layout
    struct UserOperation {
        address sender;
        uint256 nonce;
        bytes callData;
        uint256 callGasLimit;
        uint256 verificationGasLimit;
        uint256 preVerificationGas;
        uint256 maxFeePerGas;
        uint256 maxPriorityFeePerGas;
        bytes paymasterAndData;
        bytes signature;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function depositTo(address account) external payable {
        balances[account] += msg.value;
    }

    function withdrawTo(address payable to, uint256 amount) external {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        to.transfer(amount);
    }

    function callValidatePaymaster(
        address paymaster,
        UserOperation calldata userOp,
        bytes32 userOpHash
    ) external returns (bytes memory context, bool validationData) {
        return IVerifyingPaymaster(paymaster).validatePaymasterUserOp(
            userOp, userOpHash, 0
        );
    }

    receive() external payable {}
}

interface IVerifyingPaymaster {
    function validatePaymasterUserOp(
        MockEntryPoint.UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 requiredPreFund
    ) external returns (bytes memory context, bool validationData);
}
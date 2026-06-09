// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title VerifyingPaymaster — Coinbase-adapted paymaster with on-chain fee caps
/// @notice Sponsors gas via EntryPoint v0.8. Verifies backend signer signature.
/// @dev Adapted from github.com/coinbase/verifying-paymaster (MIT, audited Nov 2024)
///      Added on-chain fee caps (Section 4.9) as defense-in-depth.
contract VerifyingPaymaster is ReentrancyGuard {
    using ECDSA for bytes32;

    // --- State ---
    address public immutable entryPoint;
    address public immutable verifyingSigner;

    // --- On-chain fee caps (defense-in-depth, Section 4.9) ---
    uint256 public constant MAX_CALL_GAS = 5_000_000;
    uint256 public constant MAX_TOTAL_GAS = 6_000_000; // verification + call + preVerification
    uint256 public constant MAX_FEE_PER_GAS = 1_000_000_000; // 1 gwei

    // --- Minimal UserOperation struct ---
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

    // --- Events ---
    event PaymasterSigned(address indexed sender, uint256 nonce);

    // --- Errors ---
    error InvalidSigner();
    error GasLimitExceeded();
    error FeePerGasExceeded();
    error InvalidPaymasterSignature();
    error OnlySigner();

    constructor(address _entryPoint, address _verifyingSigner) payable {
        entryPoint = _entryPoint;
        verifyingSigner = _verifyingSigner;
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 /* requiredPreFund */
    ) external returns (bytes memory context, bool validationData) {
        // Only EntryPoint can call
        if (msg.sender != entryPoint) revert InvalidSigner();

        // --- On-chain fee cap checks (Section 4.9) ---
        if (userOp.callGasLimit > MAX_CALL_GAS) revert GasLimitExceeded();
        if (userOp.maxFeePerGas > MAX_FEE_PER_GAS) revert FeePerGasExceeded();

        uint256 totalGas = userOp.callGasLimit + userOp.verificationGasLimit + userOp.preVerificationGas;
        if (totalGas > MAX_TOTAL_GAS) revert GasLimitExceeded();

        // --- Signature verification ---
        bytes32 hash = keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.callData),
                entryPoint,
                block.chainid
            )
        );

        // Recover signer from hash + signature
        address recoveredSigner = hash.recover(userOp.signature);

        if (recoveredSigner != verifyingSigner) {
            revert InvalidPaymasterSignature();
        }

        return (abi.encode(userOp.sender), false);
    }

    // --- Deposit management ---
    function deposit() external payable {
        _sendToEntryPoint(msg.value);
    }

    function withdrawTo(address payable to, uint256 amount) external nonReentrant {
        if (msg.sender != verifyingSigner) revert OnlySigner();
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    function getDeposit() external view returns (uint256) {
        (bool success, bytes memory data) = entryPoint.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        require(success, "balanceOf call failed");
        return abi.decode(data, (uint256));
    }

    function _sendToEntryPoint(uint256 amount) private {
        (bool success, ) = entryPoint.call{value: amount}(
            abi.encodeWithSignature("depositTo(address)", address(this))
        );
        require(success, "depositTo call failed");
    }

    // --- Allow receiving ETH for refunds ---
    receive() external payable {}
}
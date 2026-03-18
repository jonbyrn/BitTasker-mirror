/**
 * Signature Verification
 * Verifies EIP-191 signatures for sponsor requests
 * Workers-compatible implementation using @noble/hashes
 */

import { ethers } from 'ethers';
import { keccak_256 } from '@noble/hashes/sha3';

/**
 * Check if a string is a valid Ethereum address
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-f0-9]{40}$/i.test(address);
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate input parameters for verifyTransferSignature
 */
function validateTransferSignatureInputs(
  chainId: number,
  routerAddress: string,
  user: string,
  recipient: string,
  amount: string,
  nonce: number,
  deadline: number,
  signature: string
): { valid: boolean; error?: string } {
  // Validate chainId
  if (!Number.isInteger(chainId) || chainId <= 0) {
    return { valid: false, error: `Invalid chainId: ${chainId}` };
  }

  // Validate addresses
  if (!isValidAddress(routerAddress)) {
    return { valid: false, error: `Invalid routerAddress format: ${routerAddress}` };
  }

  if (!isValidAddress(user)) {
    return { valid: false, error: `Invalid user address format: ${user}` };
  }

  if (!isValidAddress(recipient)) {
    return { valid: false, error: `Invalid recipient address format: ${recipient}` };
  }

  // Validate amount is a valid numeric string within uint256 bounds
  if (!amount || typeof amount !== 'string') {
    return { valid: false, error: 'Invalid amount: must be a non-empty string' };
  }
  if (!/^\d+$/.test(amount)) {
    return { valid: false, error: 'Invalid amount: must be a numeric string' };
  }
  // Max uint256: 2^256 - 1
  const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  try {
    const amountBigInt = BigInt(amount);
    if (amountBigInt <= 0) {
      return { valid: false, error: 'Invalid amount: must be positive' };
    }
    if (amountBigInt > maxUint256) {
      return { valid: false, error: 'Invalid amount: exceeds maximum uint256' };
    }
  } catch {
    return { valid: false, error: 'Invalid amount: cannot be parsed' };
  }

  // Validate signature format (should be 132 chars = 0x + 130 hex chars)
  if (!signature.startsWith('0x') || signature.length !== 132) {
    return { valid: false, error: `Invalid signature format: expected 0x + 130 hex chars, got ${signature.length}` };
  }

  // Validate signature is valid hex
  const sigHex = signature.slice(2);
  if (!/^[a-f0-9]+$/i.test(sigHex)) {
    return { valid: false, error: 'Signature contains invalid hex characters' };
  }

  // Validate nonce is non-negative
  if (!Number.isInteger(nonce) || nonce < 0) {
    return { valid: false, error: `Invalid nonce: ${nonce}` };
  }

  // Validate deadline
  if (!Number.isInteger(deadline) || deadline <= 0) {
    return { valid: false, error: `Invalid deadline: ${deadline}` };
  }

  // Check if deadline has passed
  const now = Math.floor(Date.now() / 1000);
  if (deadline < now) {
    return { valid: false, error: `Request expired: deadline ${deadline} is in the past (now: ${now})` };
  }

  return { valid: true };
}

/**
 * Verify EIP-712 signature for a transfer request
 */
export async function verifyTransferSignature(
  chainId: number,
  routerAddress: string,
  user: string,
  recipient: string,
  amount: string,
  nonce: number,
  deadline: number,
  signature: string
): Promise<boolean> {
  try {
    // Validate inputs
    const validation = validateTransferSignatureInputs(
      chainId, routerAddress, user, recipient, amount, nonce, deadline, signature
    );

    if (!validation.valid) {
      console.error('Input validation failed:', validation.error);
      return false;
    }

    const domain = {
      name: "DirectSendRouter",
      version: "1",
      chainId: chainId,
      verifyingContract: routerAddress,
    };

    const types = {
      TransferRequest: [
        { name: "user", type: "address" },
        { name: "recipient", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      user,
      recipient,
      amount,
      nonce,
      deadline,
    };

    const recoveredAddress = ethers.verifyTypedData(domain, types, value, signature);
    return recoveredAddress.toLowerCase() === user.toLowerCase();
  } catch (error) {
    console.error('Error verifying EIP-712 signature:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Verify that the signed raw transaction hash matches the actual transaction
 * Uses @noble/hashes for Workers compatibility
 */
export function verifySignedTransactionHash(
  signedRawTransaction: string,
  signedRawTransactionHash: string
): boolean {
  try {
    // Validate inputs
    if (!signedRawTransaction.startsWith('0x')) {
      console.error('Invalid transaction format: must start with 0x');
      return false;
    }

    if (!signedRawTransactionHash.startsWith('0x')) {
      console.error('Invalid hash format: must start with 0x');
      return false;
    }

    // Convert transaction hex to Uint8Array
    const txBytes = hexToBytes(signedRawTransaction);

    // Compute keccak256 hash using @noble/hashes
    const hashBytes = keccak_256(txBytes);
    const computedHash = '0x' + bytesToHex(hashBytes);

    return computedHash.toLowerCase() === signedRawTransactionHash.toLowerCase();
  } catch (error) {
    console.error('Error verifying transaction hash:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Extract sender address from signed transaction
 * Parses the transaction to recover the sender address using ecrecover
 */
export function extractSenderFromSignedTransaction(
  signedRawTransaction: string
): string | null {
  try {
    // Validate transaction format
    if (!signedRawTransaction.startsWith('0x')) {
      console.error('Invalid transaction format: must start with 0x');
      return null;
    }

    const txHex = signedRawTransaction.slice(2);
    if (txHex.length < 8) {
      console.error('Invalid transaction: too short');
      return null;
    }

    // Try to use ethers to parse the transaction and recover sender
    // This handles both legacy and EIP-155 transactions
    try {
      const parsedTx = ethers.parseTransaction(signedRawTransaction);
      if (parsedTx.from) {
        return parsedTx.from.toLowerCase();
      }
    } catch (parseError) {
      console.error('Failed to parse transaction with ethers:', parseError instanceof Error ? parseError.message : String(parseError));
    }

    // Fallback: Manual sender extraction for basic transactions
    // For EIP-155 transactions, we need chainId which requires more parsing
    // This is a basic implementation - for production, use a proper RLP parser
    console.warn('Could not extract sender from transaction - full RLP parsing not implemented');
    return null;
  } catch (error) {
    console.error('Error extracting sender:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Verify EIP-191 personal signature format
 * Checks that a message was signed with eth_personalSign
 */
export function verifyEIP191Signature(
  message: string,
  signature: string,
  expectedAddress: string
): boolean {
  try {
    // Validate inputs
    if (!message || typeof message !== 'string') {
      console.error('Invalid message: must be a non-empty string');
      return false;
    }

    if (!signature || !signature.startsWith('0x') || signature.length !== 132) {
      console.error('Invalid signature format: expected 0x + 130 hex chars');
      return false;
    }

    if (!isValidAddress(expectedAddress)) {
      console.error('Invalid expected address format:', expectedAddress);
      return false;
    }

    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Error verifying EIP-191 signature:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Create a message hash for EIP-191 personal sign
 * Format: \x19Ethereum Signed Message:\n<length><message>
 */
export function createEIP191MessageHash(message: string): string {
  const prefix = '\x19Ethereum Signed Message:\n';
  // EIP-191 specifies the length as a decimal string
  const prefixedMessage = prefix + message.length + message;
  // Use keccak_256 for the hash (same as ethers.id for this use case)
  const messageBytes = new TextEncoder().encode(prefixedMessage);
  const hashBytes = keccak_256(messageBytes);
  return '0x' + bytesToHex(hashBytes);
}

/**
 * Validate the transaction structure and method selector
 */
export function validateTransactionStructure(
  signedRawTransaction: string,
  expectedMethodSelector: string
): boolean {
  try {
    // Validate transaction format
    if (!signedRawTransaction.startsWith('0x')) {
      console.error('Invalid transaction: must start with 0x');
      return false;
    }

    // Basic hex validation
    const hexPart = signedRawTransaction.slice(2);
    if (!/^[0-9a-fA-F]*$/.test(hexPart)) {
      console.error('Invalid transaction: contains non-hex characters');
      return false;
    }

    // Method selector should be 4 bytes (8 hex chars + 0x prefix = 10 chars)
    if (!expectedMethodSelector.startsWith('0x') || expectedMethodSelector.length !== 10) {
      console.error('Invalid method selector: expected 0x + 8 hex chars');
      return false;
    }

    // Method selector hex validation
    const selectorHex = expectedMethodSelector.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(selectorHex)) {
      console.error('Invalid method selector: contains non-hex characters');
      return false;
    }

    // Should contain the method selector somewhere in the transaction data
    // This is a basic check; full verification would decode the transaction
    return hexPart.toLowerCase().includes(selectorHex.toLowerCase());
  } catch (error) {
    console.error('Error validating transaction structure:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

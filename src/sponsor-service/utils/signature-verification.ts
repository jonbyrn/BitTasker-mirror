/**
 * Signature Verification
 * Verifies EIP-191 signatures for sponsor requests
 */

import { ethers } from 'ethers';
import crypto from 'crypto';

/**
 * Verify that the signed raw transaction hash matches the actual transaction
 * This is a basic check; full verification would require parsing the transaction
 */
export function verifySignedTransactionHash(
  signedRawTransaction: string,
  signedRawTransactionHash: string
): boolean {
  try {
    // Compute the hash of the signed transaction
    const txBuffer = Buffer.from(signedRawTransaction.startsWith('0x') ? signedRawTransaction.slice(2) : signedRawTransaction, 'hex');
    const computedHash = '0x' + crypto.createHash('keccak256').update(txBuffer).digest('hex');

    return computedHash.toLowerCase() === signedRawTransactionHash.toLowerCase();
  } catch (error) {
    console.error('Error verifying transaction hash:', error);
    return false;
  }
}

/**
 * Extract sender address from signed transaction (basic implementation)
 * For production, use full transaction parsing
 */
export function extractSenderFromSignedTransaction(
  signedRawTransaction: string
): string | null {
  try {
    // This is a simplified version; full implementation would parse the RLP
    // For now, we rely on the wallet-core to provide the sender in the request
    // In production, you would parse the transaction to verify the sender
    return null;
  } catch (error) {
    console.error('Error extracting sender:', error);
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
    const recoveredAddress = ethers.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
  } catch (error) {
    console.error('Error verifying EIP-191 signature:', error);
    return false;
  }
}

/**
 * Create a message hash for EIP-191
 */
export function createEIP191MessageHash(message: string): string {
  const prefix = '\x19Ethereum Signed Message:\n';
  const prefixedMessage = prefix + message.length + message;
  return ethers.id(prefixedMessage);
}

/**
 * Validate the transaction structure and method selector
 */
export function validateTransactionStructure(
  signedRawTransaction: string,
  expectedMethodSelector: string
): boolean {
  try {
    if (!signedRawTransaction.startsWith('0x')) {
      return false;
    }

    // Basic hex validation
    const hexPart = signedRawTransaction.slice(2);
    if (!/^[0-9a-fA-F]*$/.test(hexPart)) {
      return false;
    }

    // Method selector should be 4 bytes (8 hex chars)
    if (!expectedMethodSelector.startsWith('0x') || expectedMethodSelector.length !== 10) {
      return false;
    }

    // Should contain the method selector somewhere in the transaction data
    // This is a basic check; full verification would decode the transaction
    return hexPart.toLowerCase().includes(expectedMethodSelector.toLowerCase().slice(2));
  } catch (error) {
    console.error('Error validating transaction structure:', error);
    return false;
  }
}

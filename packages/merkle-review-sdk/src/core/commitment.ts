/**
 * Commitment generation and validation
 */

import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import type { CommitmentParams } from '../types/index.js';
import type { HashFunction } from '../types/config.js';

/**
 * Commitment generator class
 */
export class CommitmentGenerator {
	private hashFunction: HashFunction;

	constructor(hashFunction: HashFunction = 'sha256') {
		this.hashFunction = hashFunction;
	}

	/**
	 * Create a deterministic commitment hash from escrow parameters
	 */
	create(params: CommitmentParams): string {
		// Create deterministic string representation
		// Order matters for determinism
		const data = [
			params.escrowId,
			params.escrowTxHash.toLowerCase(),
			params.taskerAddress.toLowerCase(),
			params.taskeeAddress.toLowerCase()
		].join('|');

		// Hash the data
		const hash = this.hash(data);

		// Return as hex string
		return Buffer.from(hash).toString('hex');
	}

	/**
	 * Validate commitment format
	 */
	validate(commitment: string): boolean {
		// Commitment should be a hex string of 64 characters (32 bytes)
		if (typeof commitment !== 'string') {
			return false;
		}

		// Check hex format and length
		const hexPattern = /^[0-9a-f]{64}$/i;
		return hexPattern.test(commitment);
	}

	/**
	 * Hash data using configured hash function
	 */
	private hash(data: string): Uint8Array {
		const encoder = new TextEncoder();
		const dataBytes = encoder.encode(data);

		switch (this.hashFunction) {
			case 'sha256':
				return sha256(dataBytes);
			case 'keccak256':
				return keccak_256(dataBytes);
			default:
				throw new Error(`Unsupported hash function: ${this.hashFunction}`);
		}
	}

	/**
	 * Set hash function
	 */
	setHashFunction(hashFunction: HashFunction): void {
		this.hashFunction = hashFunction;
	}
}


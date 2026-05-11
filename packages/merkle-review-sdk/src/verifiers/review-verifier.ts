/**
 * Review verifier using Merkle proofs
 */

import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import type { VerifiedReview, MerkleProof, VerificationResult, BatchVerificationResult } from '../types/index.js';
import type { HashFunction } from '../types/config.js';

/**
 * Review verifier class
 */
export class ReviewVerifier {
	private hashFunction: HashFunction;

	constructor(hashFunction: HashFunction = 'sha256') {
		this.hashFunction = hashFunction;
	}

	/**
	 * Verify a single review's Merkle proof
	 */
	verify(review: VerifiedReview, expectedRoot: string): VerificationResult {
		const { merkleProof, commitment } = review;

		// Validate commitment format
		if (!this.isValidHex(commitment, 64)) {
			return {
				valid: false,
				error: 'Invalid commitment format',
				details: {
					commitmentExists: false,
					proofValid: false,
					rootMatches: false
				}
			};
		}

		// Validate proof structure
		if (!this.validateProofStructure(merkleProof)) {
			return {
				valid: false,
				error: 'Invalid proof structure',
				details: {
					commitmentExists: false,
					proofValid: false,
					rootMatches: false
				}
			};
		}

		// Check that leaf matches commitment
		if (merkleProof.leaf.toLowerCase() !== commitment.toLowerCase()) {
			return {
				valid: false,
				error: 'Proof leaf does not match commitment',
				details: {
					commitmentExists: false,
					proofValid: false,
					rootMatches: false
				}
			};
		}

		// Verify proof against expected root
		const computedRoot = this.verifyProof(merkleProof);
		const rootMatches = computedRoot.toLowerCase() === expectedRoot.toLowerCase();

		if (!rootMatches) {
			return {
				valid: false,
				error: 'Computed root does not match expected root',
				details: {
					commitmentExists: true,
					proofValid: false,
					rootMatches: false
				}
			};
		}

		return {
			valid: true,
			details: {
				commitmentExists: true,
				proofValid: true,
				rootMatches: true
			}
		};
	}

	/**
	 * Verify multiple reviews in batch
	 */
	verifyBatch(reviews: VerifiedReview[], expectedRoot: string): BatchVerificationResult {
		const startTime = Date.now();
		const results = reviews.map((review, index) => {
			const result = this.verify(review, expectedRoot);
			return {
				reviewId: review.commitment || `review-${index}`,
				result
			};
		});

		const valid = results.filter(r => r.result.valid).length;
		const invalid = results.length - valid;

		return {
			total: reviews.length,
			valid,
			invalid,
			results,
			verificationTime: Date.now() - startTime
		};
	}

	/**
	 * Verify Merkle proof and compute root
	 */
	private verifyProof(proof: MerkleProof): string {
		let currentHash = Buffer.from(proof.leaf, 'hex');

		// Reconstruct root by following proof path
		for (let i = 0; i < proof.proof.length; i++) {
			const siblingHash = Buffer.from(proof.proof[i], 'hex');
			const isRight = proof.proofFlags[i];

			// Combine current hash with sibling based on position
			const combined = isRight
				? Buffer.concat([currentHash, siblingHash])
				: Buffer.concat([siblingHash, currentHash]);

			// Hash the combination
			currentHash = Buffer.from(this.hash(combined));
		}

		// Return computed root as hex string
		return '0x' + currentHash.toString('hex');
	}

	/**
	 * Validate proof structure
	 */
	private validateProofStructure(proof: MerkleProof): boolean {
		// Check that proof arrays have same length
		if (proof.proof.length !== proof.proofFlags.length) {
			return false;
		}

		// Check that leaf is valid hex
		if (!this.isValidHex(proof.leaf, 64)) {
			return false;
		}

		// Check that root is valid hex
		if (!this.isValidHex(proof.root.replace(/^0x/, ''), 64)) {
			return false;
		}

		// Check that all proof hashes are valid hex
		for (const hash of proof.proof) {
			if (!this.isValidHex(hash, 64)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Check if string is valid hex of specified length
	 */
	private isValidHex(str: string, length: number): boolean {
		const hexPattern = /^[0-9a-fA-F]+$/;
		const cleanStr = str.replace(/^0x/, '');
		return hexPattern.test(cleanStr) && cleanStr.length === length;
	}

	/**
	 * Hash data using configured hash function
	 */
	private hash(data: Buffer | Uint8Array): Uint8Array {
		const bytes = data instanceof Buffer ? new Uint8Array(data) : data;

		switch (this.hashFunction) {
			case 'sha256':
				return sha256(bytes);
			case 'keccak256':
				return keccak_256(bytes);
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



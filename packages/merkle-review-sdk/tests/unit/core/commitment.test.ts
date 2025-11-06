import { describe, it, expect, beforeEach } from 'vitest';
import { CommitmentGenerator } from '@/core/commitment';
import type { CommitmentParams } from '@/types/index';

describe('CommitmentGenerator', () => {
	let generator: CommitmentGenerator;

	beforeEach(() => {
		generator = new CommitmentGenerator('sha256');
	});

	describe('create', () => {
		it('should create deterministic commitment hash', () => {
			const params: CommitmentParams = {
				escrowId: '123',
				escrowTxHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
				taskerAddress: '0x1111111111111111111111111111111111111111',
				taskeeAddress: '0x2222222222222222222222222222222222222222'
			};

			const commitment1 = generator.create(params);
			const commitment2 = generator.create(params);

			expect(commitment1).toBe(commitment2);
			expect(commitment1).toHaveLength(64);
			expect(commitment1).toMatch(/^[0-9a-f]{64}$/i);
		});

		it('should handle different addresses correctly', () => {
			const params1: CommitmentParams = {
				escrowId: '123',
				escrowTxHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
				taskerAddress: '0x1111111111111111111111111111111111111111',
				taskeeAddress: '0x2222222222222222222222222222222222222222'
			};

			const params2: CommitmentParams = {
				escrowId: '123',
				escrowTxHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
				taskerAddress: '0x2222222222222222222222222222222222222222',
				taskeeAddress: '0x1111111111111111111111111111111111111111'
			};

			const commitment1 = generator.create(params1);
			const commitment2 = generator.create(params2);

			// Different addresses should produce different commitments
			expect(commitment1).not.toBe(commitment2);
		});

		it('should normalize addresses to lowercase', () => {
			const params1: CommitmentParams = {
				escrowId: '123',
				escrowTxHash: '0xABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234567890',
				taskerAddress: '0x1111111111111111111111111111111111111111',
				taskeeAddress: '0x2222222222222222222222222222222222222222'
			};

			const params2: CommitmentParams = {
				escrowId: '123',
				escrowTxHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
				taskerAddress: '0x1111111111111111111111111111111111111111',
				taskeeAddress: '0x2222222222222222222222222222222222222222'
			};

			const commitment1 = generator.create(params1);
			const commitment2 = generator.create(params2);

			// Should produce same commitment despite case differences
			expect(commitment1).toBe(commitment2);
		});

		it('should work with keccak256 hash function', () => {
			const keccakGenerator = new CommitmentGenerator('keccak256');
			const params: CommitmentParams = {
				escrowId: '123',
				escrowTxHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
				taskerAddress: '0x1111111111111111111111111111111111111111',
				taskeeAddress: '0x2222222222222222222222222222222222222222'
			};

			const commitment = keccakGenerator.create(params);

			expect(commitment).toHaveLength(64);
			expect(commitment).toMatch(/^[0-9a-f]{64}$/i);
		});
	});

	describe('validate', () => {
		it('should validate correct commitment format', () => {
			const validCommitment = 'a'.repeat(64);
			expect(generator.validate(validCommitment)).toBe(true);
		});

		it('should reject invalid hex characters', () => {
			const invalidCommitment = 'g'.repeat(64);
			expect(generator.validate(invalidCommitment)).toBe(false);
		});

		it('should reject wrong length', () => {
			const shortCommitment = 'a'.repeat(63);
			const longCommitment = 'a'.repeat(65);

			expect(generator.validate(shortCommitment)).toBe(false);
			expect(generator.validate(longCommitment)).toBe(false);
		});

		it('should reject non-string values', () => {
			expect(generator.validate(null as any)).toBe(false);
			expect(generator.validate(undefined as any)).toBe(false);
			expect(generator.validate(123 as any)).toBe(false);
			expect(generator.validate({} as any)).toBe(false);
		});

		it('should accept uppercase hex', () => {
			const uppercaseCommitment = 'A'.repeat(64);
			expect(generator.validate(uppercaseCommitment)).toBe(true);
		});
	});

	describe('setHashFunction', () => {
		it('should change hash function', () => {
			const params: CommitmentParams = {
				escrowId: '123',
				escrowTxHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
				taskerAddress: '0x1111111111111111111111111111111111111111',
				taskeeAddress: '0x2222222222222222222222222222222222222222'
			};

			const sha256Commitment = generator.create(params);
			generator.setHashFunction('keccak256');
			const keccakCommitment = generator.create(params);

			// Different hash functions should produce different commitments
			expect(sha256Commitment).not.toBe(keccakCommitment);
		});
	});
});


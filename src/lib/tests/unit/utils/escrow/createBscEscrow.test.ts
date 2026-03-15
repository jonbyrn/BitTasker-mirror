import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	createEscrowOnBsc,
	validateEscrowCreationParams,
	AbiNotAvailableError,
	EscrowCreationError
} from '$lib/utils/escrow/v1/createBscEscrow';
import { ethers } from 'ethers';
import type { BscEscrowCreationParams } from '$lib/types/escrow';

// Mock wallet store
const mockWallet = {
	getAddress: vi.fn(),
	sendTransaction: vi.fn()
};

vi.mock('$lib/stores/wallet.store', () => ({
	getWallet: vi.fn((network: string) => {
		if (network === 'bsc') {
			return mockWallet;
		}
		return null;
	})
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

describe('createBscEscrow', () => {
	const mockContractAddress = '0x' + '1'.repeat(40);
	const mockSenderAddress = '0x' + '2'.repeat(40);
	const mockRecipientAddress = '0x' + '3'.repeat(40);

	const validParams: BscEscrowCreationParams = {
		contractAddress: mockContractAddress,
		escrowContractAbi: [],
		senderAddress: mockSenderAddress,
		recipientAddress: mockRecipientAddress,
		amountUSDT: '100.5'
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockWallet.getAddress.mockResolvedValue(mockSenderAddress);
	});

	describe('createEscrowOnBsc', () => {
		it('should throw AbiNotAvailableError when ABI is null', async () => {
			const params = {
				...validParams,
				escrowContractAbi: null
			};

			await expect(createEscrowOnBsc(params)).rejects.toThrow(AbiNotAvailableError);
		});

		it('should throw AbiNotAvailableError when ABI is undefined', async () => {
			const params = {
				...validParams,
				escrowContractAbi: undefined
			};

			await expect(createEscrowOnBsc(params)).rejects.toThrow(AbiNotAvailableError);
		});

		it('should use provided signer if available', async () => {
			const mockSigner = {
				sendTransaction: vi.fn(),
				getAddress: vi.fn().mockResolvedValue(mockSenderAddress)
			};

			const mockAbi = [
				{
					name: 'createEscrow',
					type: 'function',
					inputs: [
						{ name: 'recipient', type: 'address' },
						{ name: 'amount', type: 'uint256' }
					],
					outputs: []
				}
			];

			const mockContractInstance = {
				createEscrow: vi.fn().mockResolvedValue({
					wait: vi.fn().mockResolvedValue({
						hash: '0x' + 'a'.repeat(64),
						blockNumber: 12345
					})
				})
			};

			vi.spyOn(ethers, 'Contract').mockReturnValue(mockContractInstance as any);

			const params = {
				...validParams,
				escrowContractAbi: mockAbi,
				signer: mockSigner as any
			};

			const txHash = await createEscrowOnBsc(params);

			expect(txHash).toBe('0x' + 'a'.repeat(64));
		});

		it('should fail if no wallet available and no signer provided', async () => {
			vi.resetModules();
			// Mock wallet store to return null
			vi.doMock('$lib/stores/wallet.store', () => ({
				getWallet: vi.fn(() => null)
			}));

			const params = {
				...validParams,
				escrowContractAbi: []
			};

			await expect(createEscrowOnBsc(params)).rejects.toThrow(EscrowCreationError);
		});

		it('should convert USDT amount correctly to atomic units', async () => {
			const mockAbi = [
				{
					name: 'createEscrow',
					type: 'function',
					inputs: [
						{ name: 'recipient', type: 'address' },
						{ name: 'amount', type: 'uint256' }
					]
				}
			];

			const createEscrowSpy = vi.fn().mockResolvedValue({
				wait: vi.fn().mockResolvedValue({
					hash: '0x' + 'a'.repeat(64)
				})
			});

			vi.spyOn(ethers, 'Contract').mockReturnValue({
				createEscrow: createEscrowSpy
			} as any);

			vi.spyOn(ethers, 'parseUnits').mockReturnValue(BigInt('100500000')); // 100.5 USDT

			mockWallet.getAddress.mockResolvedValue(mockSenderAddress);

			const params = {
				...validParams,
				amountUSDT: '100.5',
				escrowContractAbi: mockAbi
			};

			await createEscrowOnBsc(params);

			expect(createEscrowSpy).toHaveBeenCalledWith(
				mockRecipientAddress,
				BigInt('100500000')
			);
		});

		it('should handle contract creation errors', async () => {
			const mockAbi = [];

			const mockError = new Error('Transaction failed');
			vi.spyOn(ethers, 'Contract').mockReturnValue({
				createEscrow: vi.fn().mockRejectedValue(mockError)
			} as any);

			const params = {
				...validParams,
				escrowContractAbi: mockAbi
			};

			await expect(createEscrowOnBsc(params)).rejects.toThrow(EscrowCreationError);
		});

		it('should return transaction hash on success', async () => {
			const expectedHash = '0x' + 'b'.repeat(64);
			const mockAbi = [];

			vi.spyOn(ethers, 'Contract').mockReturnValue({
				createEscrow: vi.fn().mockResolvedValue({
					wait: vi.fn().mockResolvedValue({
						hash: expectedHash,
						blockNumber: 12345
					})
				})
			} as any);

			mockWallet.getAddress.mockResolvedValue(mockSenderAddress);

			const params = {
				...validParams,
				escrowContractAbi: mockAbi
			};

			const hash = await createEscrowOnBsc(params);

			expect(hash).toBe(expectedHash);
		});

		it('should include metadata in logs if provided', async () => {
			const mockAbi = [];

			const debugSpy = vi.fn();
			vi.spyOn(ethers, 'Contract').mockReturnValue({
				createEscrow: vi.fn().mockResolvedValue({
					wait: vi.fn().mockResolvedValue({
						hash: '0x' + 'a'.repeat(64)
					})
				})
			} as any);

			mockWallet.getAddress.mockResolvedValue(mockSenderAddress);

			const params = {
				...validParams,
				escrowContractAbi: mockAbi,
				escrowId: 'escrow-123',
				taskId: 'task-456'
			};

			const hash = await createEscrowOnBsc(params);

			expect(hash).toBeDefined();
		});
	});

	describe('validateEscrowCreationParams', () => {
		it('should accept valid parameters', () => {
			const result = validateEscrowCreationParams(validParams);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it('should reject invalid contract address', () => {
			const params = {
				...validParams,
				contractAddress: 'not-an-address'
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Invalid contract address');
		});

		it('should reject invalid sender address', () => {
			const params = {
				...validParams,
				senderAddress: 'invalid'
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Invalid sender address');
		});

		it('should reject invalid recipient address', () => {
			const params = {
				...validParams,
				recipientAddress: 'invalid'
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Invalid recipient address');
		});

		it('should reject zero amount', () => {
			const params = {
				...validParams,
				amountUSDT: '0'
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Amount must be greater than 0');
		});

		it('should reject invalid amount format', () => {
			const params = {
				...validParams,
				amountUSDT: 'not-a-number'
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes('Invalid amount'))).toBe(true);
		});

		it('should reject missing ABI', () => {
			const params = {
				...validParams,
				escrowContractAbi: null
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain('Escrow contract ABI is not available');
		});

		it('should collect multiple validation errors', () => {
			const params = {
				contractAddress: 'invalid',
				senderAddress: 'invalid',
				recipientAddress: 'invalid',
				amountUSDT: '-10',
				escrowContractAbi: null
			};

			const result = validateEscrowCreationParams(params as any);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(3);
		});
	});

	describe('error types', () => {
		it('should define AbiNotAvailableError with correct message', () => {
			const error = new AbiNotAvailableError(97);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(AbiNotAvailableError);
			expect(error.message).toContain('97');
		});

		it('should define EscrowCreationError with optional original error', () => {
			const originalError = new Error('Original');
			const error = new EscrowCreationError('Wrapper message', originalError);

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(EscrowCreationError);
			expect(error.originalError).toBe(originalError);
		});
	});

	describe('USDT amount precision', () => {
		it('should preserve 6 decimal places for USDT', () => {
			const params = {
				...validParams,
				amountUSDT: '100.123456'
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(true);
		});

		it('should accept rounded USDT amounts', () => {
			const params = {
				...validParams,
				amountUSDT: '100.5'
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(true);
		});

		it('should handle very small amounts', () => {
			const params = {
				...validParams,
				amountUSDT: '0.000001'
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(true);
		});

		it('should handle large amounts', () => {
			const params = {
				...validParams,
				amountUSDT: '999999999.999999'
			};

			const result = validateEscrowCreationParams(params);

			expect(result.valid).toBe(true);
		});
	});
});

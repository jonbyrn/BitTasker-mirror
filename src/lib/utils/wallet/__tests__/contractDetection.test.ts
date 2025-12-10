import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';
import {
	isContractAddress,
	hasContractInteraction,
	detectContractInteraction,
	batchCheckContractAddresses,
	clearContractCodeCache
} from '../contractDetection';
import * as contractRegistry from '../contractRegistry';

// Mock contract registry
vi.mock('../contractRegistry', () => ({
	isKnownContract: vi.fn()
}));

describe('Contract Detection', () => {
	let mockProvider: any;

	beforeEach(() => {
		vi.clearAllMocks();
		clearContractCodeCache();
		
		mockProvider = {
			getCode: vi.fn()
		};
	});

	describe('hasContractInteraction', () => {
		it('should return true for valid contract input data', () => {
			expect(hasContractInteraction('0xa9059cbb000000000000000000000000')).toBe(true);
			expect(hasContractInteraction('0x12345678000000000000000000000000')).toBe(true);
		});

		it('should return false for empty or minimal input', () => {
			expect(hasContractInteraction(null)).toBe(false);
			expect(hasContractInteraction(undefined)).toBe(false);
			expect(hasContractInteraction('0x')).toBe(false);
			expect(hasContractInteraction('0x12')).toBe(false);
		});
	});

	describe('isContractAddress', () => {
		it('should return true for contract address with code', async () => {
			mockProvider.getCode.mockResolvedValue('0x6080604052348015600f57600080fd5b50');
			
			const result = await isContractAddress('0x1234567890123456789012345678901234567890', mockProvider);
			
			expect(result).toBe(true);
			expect(mockProvider.getCode).toHaveBeenCalledWith('0x1234567890123456789012345678901234567890', undefined);
		});

		it('should return false for EOA address', async () => {
			mockProvider.getCode.mockResolvedValue('0x');
			
			const result = await isContractAddress('0x1234567890123456789012345678901234567890', mockProvider);
			
			expect(result).toBe(false);
		});

		it('should return false for null address', async () => {
			const result = await isContractAddress('0x0000000000000000000000000000000000000000', mockProvider);
			
			expect(result).toBe(false);
		});

		it('should cache results', async () => {
			mockProvider.getCode.mockResolvedValue('0x6080604052348015600f57600080fd5b50');
			const address = '0x1234567890123456789012345678901234567890';
			
			await isContractAddress(address, mockProvider);
			await isContractAddress(address, mockProvider);
			
			// Should only call getCode once due to caching
			expect(mockProvider.getCode).toHaveBeenCalledTimes(1);
		});
	});

	describe('detectContractInteraction', () => {
		it('should detect known contract', async () => {
			vi.mocked(contractRegistry.isKnownContract).mockReturnValue({
				isKnown: true,
				contractType: 'escrow',
				isCurrent: true
			});

			const result = await detectContractInteraction(
				{
					to: '0x1234567890123456789012345678901234567890',
					from: '0x0987654321098765432109876543210987654321',
					input: '0xa9059cbb'
				},
				mockProvider,
				'rsk',
				'testnet',
				'0x0987654321098765432109876543210987654321'
			);

			expect(result.isContract).toBe(true);
			expect(result.isKnownContract).toBe(true);
			expect(result.contractType).toBe('escrow');
		});

		it('should detect contract via input data', async () => {
			vi.mocked(contractRegistry.isKnownContract).mockReturnValue({
				isKnown: false,
				contractType: null,
				isCurrent: false
			});

			const result = await detectContractInteraction(
				{
					to: '0x1234567890123456789012345678901234567890',
					from: '0x0987654321098765432109876543210987654321',
					input: '0xa9059cbb000000000000000000000000'
				},
				null, // No provider
				'rsk',
				'testnet',
				'0x0987654321098765432109876543210987654321'
			);

			expect(result.isContract).toBe(true);
			expect(result.isKnownContract).toBe(false);
			expect(result.contractType).toBe('unknown');
		});

		it('should return false for non-contract transaction', async () => {
			vi.mocked(contractRegistry.isKnownContract).mockReturnValue({
				isKnown: false,
				contractType: null,
				isCurrent: false
			});

			mockProvider.getCode.mockResolvedValue('0x');

			const result = await detectContractInteraction(
				{
					to: '0x1234567890123456789012345678901234567890',
					from: '0x0987654321098765432109876543210987654321',
					input: '0x'
				},
				mockProvider,
				'rsk',
				'testnet',
				'0x0987654321098765432109876543210987654321'
			);
			
			expect(result.isContract).toBe(false);
		});
	});

	describe('batchCheckContractAddresses', () => {
		it('should batch check multiple addresses', async () => {
			const contractCode = '0x6080604052348015600f57600080fd5b50';
			mockProvider.getCode
				.mockResolvedValueOnce(contractCode) // Contract
				.mockResolvedValueOnce('0x') // EOA
				.mockResolvedValueOnce(contractCode); // Contract

			const addresses = [
				'0x1111111111111111111111111111111111111111',
				'0x2222222222222222222222222222222222222222',
				'0x3333333333333333333333333333333333333333'
			];

			const results = await batchCheckContractAddresses(addresses, mockProvider);

			expect(results.get(addresses[0].toLowerCase())).toBe(true);
			expect(results.get(addresses[1].toLowerCase())).toBe(false);
			expect(results.get(addresses[2].toLowerCase())).toBe(true);
		});
	});
});


import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EscrowData } from '$lib/types/wallet';
import { EscrowStatus } from '$lib/utils/escrow';

const mockEnsureEscrowReady = vi.fn();
const mockLoadEscrowDetails = vi.fn();

vi.mock('$lib/utils/escrow/v1/escrow', () => ({
	escrow: {
		ensureEscrowReady: (...args: unknown[]) => mockEnsureEscrowReady(...args),
		loadEscrowDetails: (escrowId: string) => mockLoadEscrowDetails(escrowId)
	}
}));

import { loadContractsByAddress } from '$lib/utils/wallet/loadContractsByAddress';

const mockContract = {
	nextEscrowId: vi.fn()
};

describe('loadContractsByAddress', () => {
	const mockWalletAddress = '0x1234567890123456789012345678901234567890';
	const mockContract1: EscrowData = {
		id: '1',
		client: '0x1234567890123456789012345678901234567890',
		freelancer: '0x0987654321098765432109876543210987654321',
		baseAmount: '1.0',
		clientFee: '0.025',
		freelancerFee: '0.025',
		totalAmount: '1.05',
		status: EscrowStatus.Funded,
		estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
		estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
		completionTime: 0,
		timelockExpiry: 0,
		clientFeeTier: 1,
		freelancerFeeTier: 1,
		createdAt: Math.floor(Date.now() / 1000) - 3600,
		lastUpdated: Date.now()
	};

	const mockContract2: EscrowData = {
		id: '2',
		client: '0x1111111111111111111111111111111111111111',
		freelancer: '0x1234567890123456789012345678901234567890',
		baseAmount: '2.0',
		clientFee: '0.05',
		freelancerFee: '0.05',
		totalAmount: '2.1',
		status: EscrowStatus.Completed,
		estimatedStartTime: Math.floor(Date.now() / 1000) - 7200,
		estimatedCompletionTime: Math.floor(Date.now() / 1000) - 3600,
		completionTime: Math.floor(Date.now() / 1000) - 1800,
		timelockExpiry: 0,
		clientFeeTier: 1,
		freelancerFeeTier: 1,
		createdAt: Math.floor(Date.now() / 1000) - 10800,
		lastUpdated: Date.now()
	};

	beforeEach(() => {
		vi.clearAllMocks();
		mockEnsureEscrowReady.mockResolvedValue({
			contract: mockContract,
			wallet: {},
			provider: {}
		});
		mockContract.nextEscrowId.mockResolvedValue(BigInt(10));
	});

	describe('Successful loading', () => {
		it('should load contracts where user is client', async () => {
			mockLoadEscrowDetails
				.mockResolvedValueOnce(mockContract1)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(null);

			const contracts = await loadContractsByAddress(mockWalletAddress, 3);

			expect(contracts).toHaveLength(1);
			expect(contracts[0].id).toBe('1');
			expect(contracts[0].client.toLowerCase()).toBe(mockWalletAddress.toLowerCase());
		});

		it('should load contracts where user is freelancer', async () => {
			mockLoadEscrowDetails
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(mockContract2)
				.mockResolvedValueOnce(null);

			const contracts = await loadContractsByAddress(mockWalletAddress, 3);

			expect(contracts).toHaveLength(1);
			expect(contracts[0].id).toBe('2');
			expect(contracts[0].freelancer.toLowerCase()).toBe(mockWalletAddress.toLowerCase());
		});

		it('should load multiple contracts for the same address', async () => {
			mockLoadEscrowDetails
				.mockResolvedValueOnce(mockContract1)
				.mockResolvedValueOnce(mockContract2)
				.mockResolvedValueOnce(null);

			const contracts = await loadContractsByAddress(mockWalletAddress, 3);

			expect(contracts.length).toBeGreaterThanOrEqual(1);
		});

		it('should filter out contracts where user is neither client nor freelancer', async () => {
			const otherContract: EscrowData = {
				...mockContract1,
				client: '0x9999999999999999999999999999999999999999',
				freelancer: '0x8888888888888888888888888888888888888888'
			};

			mockLoadEscrowDetails
				.mockResolvedValueOnce(mockContract1)
				.mockResolvedValueOnce(otherContract)
				.mockResolvedValueOnce(mockContract2);

			const contracts = await loadContractsByAddress(mockWalletAddress, 3);

			contracts.forEach((contract) => {
				const isClient = contract.client.toLowerCase() === mockWalletAddress.toLowerCase();
				const isFreelancer = contract.freelancer.toLowerCase() === mockWalletAddress.toLowerCase();
				expect(isClient || isFreelancer).toBe(true);
			});
		});
	});

	describe('Error handling', () => {
		it('should return empty array when nextEscrowId fails', async () => {
			mockContract.nextEscrowId.mockRejectedValue(new Error('RPC error'));

			const contracts = await loadContractsByAddress(mockWalletAddress);

			expect(contracts).toEqual([]);
		});

		it('should skip failed escrow loads and continue', async () => {
			mockLoadEscrowDetails
				.mockResolvedValueOnce(mockContract1)
				.mockRejectedValueOnce(new Error('Escrow not found'))
				.mockResolvedValueOnce(mockContract2);

			const contracts = await loadContractsByAddress(mockWalletAddress, 3);

			expect(contracts.length).toBeGreaterThanOrEqual(1);
		});

		it('should throw when contract is not available', async () => {
			mockEnsureEscrowReady.mockResolvedValue({
				contract: null,
				wallet: {},
				provider: {}
			});

			await expect(loadContractsByAddress(mockWalletAddress)).rejects.toThrow(
				'Contract not available'
			);
		});
	});

	describe('Limit parameter', () => {
		it('should respect limit parameter', async () => {
			mockContract.nextEscrowId.mockResolvedValue(BigInt(100));
			mockLoadEscrowDetails.mockResolvedValue(null);

			await loadContractsByAddress(mockWalletAddress, 50);

			expect(mockLoadEscrowDetails).toHaveBeenCalledTimes(50);
		});

		it('should default to 100 if limit not specified', async () => {
			mockContract.nextEscrowId.mockResolvedValue(BigInt(200));
			mockLoadEscrowDetails.mockResolvedValue(null);

			await loadContractsByAddress(mockWalletAddress);

			expect(mockLoadEscrowDetails).toHaveBeenCalledTimes(100);
		});
	});

	describe('BSC network', () => {
		it('should return empty array for BSC (not yet supported)', async () => {
			const contracts = await loadContractsByAddress(mockWalletAddress, 10, 'BSC');

			expect(contracts).toEqual([]);
			expect(mockEnsureEscrowReady).not.toHaveBeenCalled();
		});
	});
});

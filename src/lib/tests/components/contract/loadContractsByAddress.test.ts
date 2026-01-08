import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EscrowData } from '$lib/types/wallet';
import { EscrowStatus } from '$lib/utils/enums/escrow.enum';

// Mock escrow module before importing loadContractsByAddress
const mockEnsureEscrowReady = vi.fn();
const mockGetEscrow = vi.fn();

vi.mock('../escrow', () => ({
	escrow: {
		ensureEscrowReady: () => mockEnsureEscrowReady(),
		getEscrow: (id: string) => mockGetEscrow(id)
	}
}));

// Mock wallet store
vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {
		subscribe: vi.fn(() => () => {})
	}
}));

// Now import after mocks are set up
import { loadContractsByAddress } from '../loadContractsByAddress';

// Mock ethers Contract
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
			wallet: {} as any,
			provider: {} as any
		});
		mockContract.nextEscrowId.mockResolvedValue(BigInt(10));
	});

	describe('Successful loading', () => {
		it('should load contracts where user is client', async () => {
			mockGetEscrow
				.mockResolvedValueOnce(mockContract1)
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(null);

			const contracts = await loadContractsByAddress(mockWalletAddress, 3);

			expect(contracts).toHaveLength(1);
			expect(contracts[0].id).toBe('1');
			expect(contracts[0].client.toLowerCase()).toBe(mockWalletAddress.toLowerCase());
		});

		it('should load contracts where user is freelancer', async () => {
			mockGetEscrow
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(mockContract2)
				.mockResolvedValueOnce(null);

			const contracts = await loadContractsByAddress(mockWalletAddress, 3);

			expect(contracts).toHaveLength(1);
			expect(contracts[0].id).toBe('2');
			expect(contracts[0].freelancer.toLowerCase()).toBe(mockWalletAddress.toLowerCase());
		});

		it('should load multiple contracts for the same address', async () => {
			mockGetEscrow
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

			mockGetEscrow
				.mockResolvedValueOnce(mockContract1)
				.mockResolvedValueOnce(otherContract)
				.mockResolvedValueOnce(mockContract2);

			const contracts = await loadContractsByAddress(mockWalletAddress, 3);

			// Should only include contracts where user is client or freelancer
			contracts.forEach((contract) => {
				const isClient = contract.client.toLowerCase() === mockWalletAddress.toLowerCase();
				const isFreelancer =
					contract.freelancer.toLowerCase() === mockWalletAddress.toLowerCase();
				expect(isClient || isFreelancer).toBe(true);
			});
		});
	});

	describe('Error handling', () => {
		it('should handle errors when getting nextEscrowId', async () => {
			mockContract.nextEscrowId.mockRejectedValue(new Error('RPC error'));

			const contracts = await loadContractsByAddress(mockWalletAddress);

			expect(contracts).toEqual([]);
		});

		it('should skip failed escrow loads and continue', async () => {
			mockGetEscrow
				.mockResolvedValueOnce(mockContract1)
				.mockRejectedValueOnce(new Error('Escrow not found'))
				.mockResolvedValueOnce(mockContract2);

			const contracts = await loadContractsByAddress(mockWalletAddress, 3);

			expect(contracts.length).toBeGreaterThanOrEqual(1);
		});

		it('should throw error when contract is not available', async () => {
			mockEnsureEscrowReady.mockResolvedValue({
				contract: null,
				wallet: {} as any,
				provider: {} as any
			});

			await expect(loadContractsByAddress(mockWalletAddress)).rejects.toThrow(
				'Contract not available'
			);
		});
	});

	describe('Limit parameter', () => {
		it('should respect limit parameter', async () => {
			mockContract.nextEscrowId.mockResolvedValue(BigInt(100));

			mockGetEscrow.mockResolvedValue(null);

			await loadContractsByAddress(mockWalletAddress, 50);

			// Should only call getEscrow for last 50 contracts
			expect(mockGetEscrow).toHaveBeenCalledTimes(50);
		});

		it('should default to 100 if limit not specified', async () => {
			mockContract.nextEscrowId.mockResolvedValue(BigInt(200));

			mockGetEscrow.mockResolvedValue(null);

			await loadContractsByAddress(mockWalletAddress);

			// Should call getEscrow for last 100 contracts
			expect(mockGetEscrow).toHaveBeenCalledTimes(100);
		});
	});
});


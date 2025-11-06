import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EthersBlockchainProvider } from '@/providers/ethers';
import type { Contract, JsonRpcProvider } from 'ethers';
import { EscrowStatus } from '@/types/blockchain';

describe('EthersBlockchainProvider', () => {
	let mockContract: Partial<Contract>;
	let mockProvider: Partial<JsonRpcProvider>;
	let provider: EthersBlockchainProvider;

	beforeEach(() => {
		mockProvider = {
			getBlock: vi.fn(),
			getTransactionReceipt: vi.fn()
		};

		mockContract = {
			getEscrow: vi.fn(),
			filters: {
				EscrowCreated: vi.fn(),
				EscrowResolved: vi.fn()
			},
			queryFilter: vi.fn()
		};

		provider = new EthersBlockchainProvider({
			contract: mockContract as Contract,
			provider: mockProvider as JsonRpcProvider,
			contractABI: []
		});
	});

	describe('getEscrow', () => {
		it('should return escrow details', async () => {
			const mockEscrowData = {
				client: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
				freelancer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
				state: 4, // Completed
				amount: BigInt('1000000000000000000')
			};

			vi.mocked(mockContract.getEscrow).mockResolvedValue(mockEscrowData);
			vi.mocked(mockProvider.getBlock).mockResolvedValue({
				timestamp: 1000
			} as any);

			const result = await provider.getEscrow('1');

			expect(result).toBeDefined();
			expect(result?.id).toBe('1');
			expect(result?.client).toBe('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
			expect(result?.freelancer).toBe('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
			expect(result?.status).toBe(EscrowStatus.Completed);
			expect(result?.amount).toBe('1000000000000000000');
		});

		it('should return null on error', async () => {
			vi.mocked(mockContract.getEscrow).mockRejectedValue(new Error('Not found'));

			const result = await provider.getEscrow('999');

			expect(result).toBeNull();
		});

		it('should map all status values correctly', async () => {
			const statusMap = [
				{ state: 0, expected: EscrowStatus.Funded },
				{ state: 1, expected: EscrowStatus.InDispute },
				{ state: 2, expected: EscrowStatus.DisputeResolved },
				{ state: 3, expected: EscrowStatus.DisputeUnresolved },
				{ state: 4, expected: EscrowStatus.Completed },
				{ state: 5, expected: EscrowStatus.Cancelled }
			];

			for (const { state, expected } of statusMap) {
				vi.mocked(mockContract.getEscrow).mockResolvedValue({
					client: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
					freelancer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
					state,
					amount: BigInt('1000000000000000000')
				});
				vi.mocked(mockProvider.getBlock).mockResolvedValue({
					timestamp: 1000
				} as any);

				const result = await provider.getEscrow('1');
				expect(result?.status).toBe(expected);
			}
		});
	});

	describe('queryEscrowCreatedEvents', () => {
		it('should query and parse EscrowCreated events', async () => {
			const mockEvent = {
				args: [
					BigInt('1'), // escrowId
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // client
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', // freelancer
					BigInt('1000000000000000000') // amount
				],
				transactionHash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
				blockNumber: 100,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 1000 })
			};

			vi.mocked(mockContract.filters.EscrowCreated).mockReturnValue({} as any);
			vi.mocked(mockContract.queryFilter).mockResolvedValue([mockEvent] as any);

			const results = await provider.queryEscrowCreatedEvents({});

			expect(results).toHaveLength(1);
			expect(results[0].escrowId).toBe('1');
			expect(results[0].type).toBe('EscrowCreated');
			expect(results[0].transactionHash).toBe('0x1111111111111111111111111111111111111111111111111111111111111111');
		});

		it('should filter by fromBlock and toBlock', async () => {
			vi.mocked(mockContract.filters.EscrowCreated).mockReturnValue({} as any);
			vi.mocked(mockContract.queryFilter).mockResolvedValue([]);

			await provider.queryEscrowCreatedEvents({ fromBlock: 100, toBlock: 200 });

			expect(mockContract.queryFilter).toHaveBeenCalledWith({}, 100, 200);
		});

		it('should return empty array on error', async () => {
			vi.mocked(mockContract.filters.EscrowCreated).mockReturnValue({} as any);
			vi.mocked(mockContract.queryFilter).mockRejectedValue(new Error('Network error'));

			const results = await provider.queryEscrowCreatedEvents({});

			expect(results).toEqual([]);
		});
	});

	describe('queryEscrowResolvedEvents', () => {
		it('should query and parse EscrowResolved events', async () => {
			const mockEvent = {
				args: [
					BigInt('1'), // escrowId
					'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // client
					'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', // freelancer
					BigInt('1000000000000000000'), // amount
					BigInt('950000000000000000'), // freelancerAmount
					BigInt('50000000000000000') // platformFee
				],
				transactionHash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
				blockNumber: 200,
				getBlock: vi.fn().mockResolvedValue({ timestamp: 2000 })
			};

			vi.mocked(mockContract.filters.EscrowResolved).mockReturnValue({} as any);
			vi.mocked(mockContract.queryFilter).mockResolvedValue([mockEvent] as any);

			const results = await provider.queryEscrowResolvedEvents({});

			expect(results).toHaveLength(1);
			expect(results[0].escrowId).toBe('1');
			expect(results[0].type).toBe('EscrowResolved');
			expect(results[0].freelancerAmount).toBe('950000000000000000');
			expect(results[0].platformFee).toBe('50000000000000000');
		});

		it('should filter by escrowId', async () => {
			vi.mocked(mockContract.filters.EscrowResolved).mockReturnValue({} as any);
			vi.mocked(mockContract.queryFilter).mockResolvedValue([]);

			await provider.queryEscrowResolvedEvents({ escrowId: '1' });

			expect(mockContract.filters.EscrowResolved).toHaveBeenCalledWith('1', null, null);
		});
	});

	describe('getTransactionReceipt', () => {
		it('should return transaction receipt', async () => {
			const mockReceipt = {
				hash: '0x3333333333333333333333333333333333333333333333333333333333333333',
				blockNumber: 300,
				status: 1,
				logs: [],
				getBlock: vi.fn().mockResolvedValue({ timestamp: 3000 })
			};

			vi.mocked(mockProvider.getTransactionReceipt).mockResolvedValue(mockReceipt as any);

			const result = await provider.getTransactionReceipt('0x3333333333333333333333333333333333333333333333333333333333333333');

			expect(result).toBeDefined();
			expect(result?.hash).toBe('0x3333333333333333333333333333333333333333333333333333333333333333');
			expect(result?.status).toBe(true);
			expect(result?.blockNumber).toBe(300);
		});

		it('should return null for non-existent transaction', async () => {
			vi.mocked(mockProvider.getTransactionReceipt).mockResolvedValue(null);

			const result = await provider.getTransactionReceipt('0x0000000000000000000000000000000000000000000000000000000000000000');

			expect(result).toBeNull();
		});

		it('should handle failed transactions', async () => {
			const mockReceipt = {
				hash: '0x4444444444444444444444444444444444444444444444444444444444444444',
				blockNumber: 400,
				status: 0, // Failed
				logs: [],
				getBlock: vi.fn().mockResolvedValue({ timestamp: 4000 })
			};

			vi.mocked(mockProvider.getTransactionReceipt).mockResolvedValue(mockReceipt as any);

			const result = await provider.getTransactionReceipt('0x4444444444444444444444444444444444444444444444444444444444444444');

			expect(result?.status).toBe(false);
		});
	});
});


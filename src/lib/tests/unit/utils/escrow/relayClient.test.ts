import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';
import {
	fetchRelayInfo,
	buildMetaTransaction,
	postToRelay,
	pollForReceipt,
	submitEscrowWrite
} from '$lib/utils/escrow/relayClient';
import type { Contract, JsonRpcProvider } from 'ethers';

const RELAY_URL = 'https://relay.test';

describe('relayClient', () => {
	let mockFetch: ReturnType<typeof vi.fn>;
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		mockFetch = vi.fn();
		globalThis.fetch = mockFetch;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
	});

	describe('fetchRelayInfo', () => {
		it('returns relay info on success', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						securePaymentAddress: '0x1234567890123456789012345678901234567890',
						chainId: '31'
					})
			});

			const info = await fetchRelayInfo(RELAY_URL);

			expect(info.securePaymentAddress).toBe('0x1234567890123456789012345678901234567890');
			expect(info.chainId).toBe('31');
			expect(mockFetch).toHaveBeenCalledWith(`${RELAY_URL}/info`);
		});

		it('throws when response is not ok', async () => {
			mockFetch.mockResolvedValueOnce({ ok: false });

			await expect(fetchRelayInfo(RELAY_URL)).rejects.toThrow('Relay /info failed');
		});

		it('throws when response lacks required fields', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({})
			});

			await expect(fetchRelayInfo(RELAY_URL)).rejects.toThrow('Invalid relay /info response');
		});
	});

	describe('buildMetaTransaction', () => {
		it('produces valid sender, data, and signature', async () => {
			const wallet = new ethers.Wallet(
				'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
			);
			const iface = new ethers.Interface(['function completeTask(uint32 paymentId)']);
			const contractAddress = '0x1234567890123456789012345678901234567890';
			const chainId = '31';

			const { sender, data, signature } = await buildMetaTransaction(
				wallet,
				contractAddress,
				chainId,
				iface,
				'completeTask',
				[5]
			);

			expect(sender).toMatch(/^0x[a-fA-F0-9]{40}$/);
			expect(data).toMatch(/^0x[a-fA-F0-9]+$/);
			expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
		});
	});

	describe('postToRelay', () => {
		it('returns txHash on 202', async () => {
			mockFetch.mockResolvedValueOnce({
				status: 202,
				json: () => Promise.resolve({ txHash: '0xabcdef1234567890' })
			});

			const { txHash } = await postToRelay(RELAY_URL, '0x1234', '0xabcd', '0xdef0');

			expect(txHash).toBe('0xabcdef1234567890');
			expect(mockFetch).toHaveBeenCalledWith(
				`${RELAY_URL}/relay`,
				expect.objectContaining({
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ sender: '0x1234', data: '0xabcd', signature: '0xdef0' })
				})
			);
		});

		it('throws on non-202', async () => {
			mockFetch.mockResolvedValueOnce({
				status: 400,
				json: () => Promise.resolve({ error: 'SIMULATION_FAILED', message: 'OnlyTaskee' })
			});

			await expect(postToRelay(RELAY_URL, '0x', '0x', '0x')).rejects.toThrow('OnlyTaskee');
		});
	});

	describe('pollForReceipt', () => {
		it('returns receipt when found', async () => {
			const receipt = {
				blockNumber: 12345,
				hash: '0xabc',
				status: 1
			} as ethers.TransactionReceipt;
			const mockGetReceipt = vi.fn().mockResolvedValueOnce(receipt);
			const provider = {
				getTransactionReceipt: mockGetReceipt
			} as unknown as JsonRpcProvider;

			const result = await pollForReceipt(provider, '0xabc');

			expect(result).toBe(receipt);
			expect(mockGetReceipt).toHaveBeenCalledWith('0xabc');
		});

		it('returns null after max attempts when receipt never appears', async () => {
			const mockGetReceipt = vi.fn().mockResolvedValue(null);
			const provider = {
				getTransactionReceipt: mockGetReceipt
			} as unknown as JsonRpcProvider;

			vi.useFakeTimers();
			const resultPromise = pollForReceipt(provider, '0xabc');
			// Advance past all poll attempts (60 * 5000ms)
			await vi.advanceTimersByTimeAsync(60 * 5000 + 100);
			const result = await resultPromise;
			vi.useRealTimers();

			expect(result).toBeNull();
		});
	});

	describe('submitEscrowWrite', () => {
		const createMockContract = (): Contract => {
			const wallet = new ethers.Wallet(
				'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
			);
			return new ethers.Contract(
				'0x1234567890123456789012345678901234567890',
				['function completeTask(uint32)'],
				wallet
			) as unknown as Contract;
		};

		it('uses direct path when useGasless is false', async () => {
			const wallet = new ethers.Wallet(
				'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
			);
			const provider = new ethers.JsonRpcProvider('http://localhost:8545');
			const contract = createMockContract();

			// Mock provider and contract for direct execution
			const mockTx = {
				hash: '0xdirect123',
				wait: vi.fn().mockResolvedValue({ blockNumber: 1 })
			};
			vi.spyOn(provider, 'getFeeData').mockResolvedValue({
				gasPrice: 1n,
				maxFeePerGas: null,
				maxPriorityFeePerGas: null
			});
			vi.spyOn(contract, 'completeTask').mockReturnValue({
				estimateGas: vi.fn().mockResolvedValue(100000n),
				...mockTx
			});

			const result = await submitEscrowWrite({
				contract,
				wallet,
				provider,
				method: 'completeTask',
				args: [5],
				contractAddress: '0x1234567890123456789012345678901234567890',
				relayBaseUrl: RELAY_URL,
				useGasless: false
			});

			expect(result.hash).toBe('0xdirect123');
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('uses direct path when relayBaseUrl is missing', async () => {
			const wallet = new ethers.Wallet(
				'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
			);
			const provider = new ethers.JsonRpcProvider('http://localhost:8545');
			const contract = createMockContract();

			const mockTx = {
				hash: '0xdirect456',
				wait: vi.fn().mockResolvedValue({ blockNumber: 1 })
			};
			vi.spyOn(provider, 'getFeeData').mockResolvedValue({
				gasPrice: 1n,
				maxFeePerGas: null,
				maxPriorityFeePerGas: null
			});
			vi.spyOn(contract, 'completeTask').mockReturnValue({
				estimateGas: vi.fn().mockResolvedValue(100000n),
				...mockTx
			});

			const result = await submitEscrowWrite({
				contract,
				wallet,
				provider,
				method: 'completeTask',
				args: [5],
				contractAddress: '0x1234567890123456789012345678901234567890',
				useGasless: true
			});

			expect(result.hash).toBe('0xdirect456');
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('uses relay path when relay returns 202', async () => {
			const wallet = new ethers.Wallet(
				'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
			);
			const provider = new ethers.JsonRpcProvider('http://localhost:8545');
			const contract = createMockContract();

			// Mock /info then /relay
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve({
							securePaymentAddress: '0x1234567890123456789012345678901234567890',
							chainId: '31'
						})
				})
				.mockResolvedValueOnce({
					status: 202,
					json: () => Promise.resolve({ txHash: '0xrelay789' })
				});

			const mockGetReceipt = vi.fn().mockResolvedValue({
				blockNumber: 100,
				hash: '0xrelay789'
			});
			vi.spyOn(provider, 'getTransactionReceipt').mockImplementation(mockGetReceipt);

			const result = await submitEscrowWrite({
				contract,
				wallet,
				provider,
				method: 'completeTask',
				args: [5],
				contractAddress: '0x1234567890123456789012345678901234567890',
				relayBaseUrl: RELAY_URL,
				useGasless: true
			});

			expect(result.hash).toBe('0xrelay789');
			expect(mockFetch).toHaveBeenCalledTimes(2); // /info and /relay
		});

		it('falls back to direct when relay fails with SIMULATION_FAILED', async () => {
			const wallet = new ethers.Wallet(
				'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
			);
			const provider = new ethers.JsonRpcProvider('http://localhost:8545');
			const contract = createMockContract();

			// Use message containing SIMULATION_FAILED so relay client skips retries
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: () =>
						Promise.resolve({
							securePaymentAddress: '0x1234567890123456789012345678901234567890',
							chainId: '31'
						})
				})
				.mockResolvedValueOnce({
					status: 400,
					json: () =>
						Promise.resolve({
							error: 'SIMULATION_FAILED',
							message: 'SIMULATION_FAILED: OnlyTaskee'
						})
				});

			const mockTx = {
				hash: '0xfallback123',
				wait: vi.fn().mockResolvedValue({ blockNumber: 1 })
			};
			vi.spyOn(provider, 'getFeeData').mockResolvedValue({
				gasPrice: 1n,
				maxFeePerGas: null,
				maxPriorityFeePerGas: null
			});
			vi.spyOn(contract, 'completeTask').mockReturnValue({
				estimateGas: vi.fn().mockResolvedValue(100000n),
				...mockTx
			});

			const result = await submitEscrowWrite({
				contract,
				wallet,
				provider,
				method: 'completeTask',
				args: [5],
				contractAddress: '0x1234567890123456789012345678901234567890',
				relayBaseUrl: RELAY_URL,
				useGasless: true
			});

			expect(result.hash).toBe('0xfallback123');
			// /info + /relay (no retry because message contains SIMULATION_FAILED)
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it('always uses direct for createPaymentContract', async () => {
			const wallet = new ethers.Wallet(
				'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
			);
			const provider = new ethers.JsonRpcProvider('http://localhost:8545');
			const iface = new ethers.Interface([
				'function createPaymentContract(address,uint32,uint32,uint8,uint8,uint72,uint72) payable returns (uint32)'
			]);
			const contract = new ethers.Contract(
				'0x1234567890123456789012345678901234567890',
				iface,
				wallet
			) as unknown as Contract;

			const mockTx = {
				hash: '0xcreate123',
				wait: vi.fn().mockResolvedValue({ blockNumber: 1 })
			};
			vi.spyOn(provider, 'getFeeData').mockResolvedValue({
				gasPrice: 1n,
				maxFeePerGas: null,
				maxPriorityFeePerGas: null
			});
			vi.spyOn(contract, 'createPaymentContract').mockReturnValue({
				estimateGas: vi.fn().mockResolvedValue(200000n),
				...mockTx
			});

			const result = await submitEscrowWrite({
				contract,
				wallet,
				provider,
				method: 'createPaymentContract',
				args: ['0x1234567890123456789012345678901234567890', 0, 0, 1, 1, 0n, 0n],
				value: ethers.parseEther('1'),
				contractAddress: '0x1234567890123456789012345678901234567890',
				relayBaseUrl: RELAY_URL,
				useGasless: true
			});

			expect(result.hash).toBe('0xcreate123');
			expect(mockFetch).not.toHaveBeenCalled();
		});
	});
});

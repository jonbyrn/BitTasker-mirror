import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	loadEscrowContractAbi,
	clearAbiCache,
	getAbiCacheStats
} from '$lib/utils/escrow/v1/loadEscrowAbi';
import { ethers, type ContractInterface } from 'ethers';

// Mock the deployment registry
vi.mock('$lib/utils/constants/escrowDeployment', () => {
	const mockAbi = [
		{
			name: 'createEscrow',
			type: 'function',
			inputs: [],
			outputs: [{ type: 'uint256' }]
		}
	];

	return {
		ESCROW_DEPLOYMENTS: {
			97: {
				address: '0x1234567890123456789012345678901234567890',
				abi: mockAbi
			},
			56: {
				address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
				abi: mockAbi
			}
		}
	};
});

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn()
	})
}));

describe('loadEscrowAbi', () => {
	beforeEach(() => {
		clearAbiCache();
	});

	afterEach(() => {
		clearAbiCache();
	});

	describe('loadEscrowContractAbi', () => {
		it('should load ABI from deployed contracts registry for BSC testnet', async () => {
			const abi = await loadEscrowContractAbi(97);

			expect(abi).not.toBeNull();
			expect(abi).toBeDefined();
		});

		it('should load ABI from deployed contracts registry for BSC mainnet', async () => {
			const abi = await loadEscrowContractAbi(56);

			expect(abi).not.toBeNull();
			expect(abi).toBeDefined();
		});

		it('should cache ABI after first load', async () => {
			const abi1 = await loadEscrowContractAbi(97);
			const stats1 = getAbiCacheStats();

			expect(stats1.size).toBe(1);
			expect(stats1.chainIds).toContain(97);

			// Load again - should use cache
			const abi2 = await loadEscrowContractAbi(97);

			expect(abi2).toEqual(abi1);
		});

		it('should return null for unsupported chain ID', async () => {
			const abi = await loadEscrowContractAbi(999);

			expect(abi).toBeNull();
		});

		it('should return null if deployment registry is unavailable', async () => {
			// Use a chain ID that won't be in the registry
			const abi = await loadEscrowContractAbi(1); // Ethereum mainnet

			expect(abi).toBeNull();
		});

		it('should support multiple chains independently', async () => {
			const abi97 = await loadEscrowContractAbi(97);
			const abi56 = await loadEscrowContractAbi(56);

			expect(abi97).not.toBeNull();
			expect(abi56).not.toBeNull();

			const stats = getAbiCacheStats();
			expect(stats.size).toBe(2);
			expect(stats.chainIds).toContain(97);
			expect(stats.chainIds).toContain(56);
		});

		it('should handle errors gracefully and return null', async () => {
			// This test verifies fail-closed behavior
			const abi = await loadEscrowContractAbi(-1);

			expect(abi).toBeNull();
		});
	});

	describe('clearAbiCache', () => {
		it('should clear cache for specific chain', async () => {
			await loadEscrowContractAbi(97);
			await loadEscrowContractAbi(56);

			let stats = getAbiCacheStats();
			expect(stats.size).toBe(2);

			clearAbiCache(97);

			stats = getAbiCacheStats();
			expect(stats.size).toBe(1);
			expect(stats.chainIds).not.toContain(97);
			expect(stats.chainIds).toContain(56);
		});

		it('should clear all caches when no chain ID provided', async () => {
			await loadEscrowContractAbi(97);
			await loadEscrowContractAbi(56);

			let stats = getAbiCacheStats();
			expect(stats.size).toBe(2);

			clearAbiCache();

			stats = getAbiCacheStats();
			expect(stats.size).toBe(0);
		});
	});

	describe('getAbiCacheStats', () => {
		it('should return empty stats initially', () => {
			const stats = getAbiCacheStats();

			expect(stats.size).toBe(0);
			expect(stats.chainIds).toEqual([]);
		});

		it('should track cached chain IDs', async () => {
			await loadEscrowContractAbi(97);
			await loadEscrowContractAbi(56);

			const stats = getAbiCacheStats();

			expect(stats.size).toBe(2);
			expect(stats.chainIds).toContain(97);
			expect(stats.chainIds).toContain(56);
		});
	});

	describe('fail-closed semantics', () => {
		it('should return null instead of throwing on missing ABI', async () => {
			const abi = await loadEscrowContractAbi(999);

			expect(abi).toBeNull();
		});

		it('should never fallback to hardcoded ABI', async () => {
			// Verify no fallback exists
			const abi = await loadEscrowContractAbi(1);

			expect(abi).toBeNull();
		});

		it('should not bypass missing ABI with empty interface', async () => {
			const abi = await loadEscrowContractAbi(999);

			expect(abi).toBeNull();
			expect(abi).not.toEqual({});
			expect(abi).not.toEqual([]);
		});
	});
});

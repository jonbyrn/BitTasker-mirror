import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
	resolveContractAddress, 
	resolveContractNetwork,
	getTotalPaymentUsd,
	getBtcPriceAtCreation
} from '$lib/utils/wallet/contractResolver';
import type { NostrContractV1, NostrContractV2 } from '$lib/types/contract';

describe('Contract Resolution', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset environment variables with valid Ethereum addresses
		vi.stubEnv('VITE_RSK_CONTRACT_ADDRESS_TESTNET', '0x1234567890123456789012345678901234567890');
		vi.stubEnv('VITE_RSK_CONTRACT_ADDRESS_MAINNET', '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
		vi.stubEnv('VITE_BSC_CONTRACT_ADDRESS', '0xfedcbafedcbafedcbafedcbafedcbafedcbafedc');
	});

	describe('resolveContractAddress', () => {
		it('returns stored address for v2 contracts', async () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0x1234567890123456789012345678901234567890',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				taskId: '456',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
			};
			
			const address = await resolveContractAddress(v2Contract);
			expect(address.toLowerCase()).toBe('0x1234567890123456789012345678901234567890');
		});

		it('returns checksummed address for v2 contracts', async () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				taskId: '456',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
			};
			
			const address = await resolveContractAddress(v2Contract);
			// Should be checksummed
			expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
		});

		it('falls back to env var for v1 contracts without transaction hash', async () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
				taskId: '456',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
				// No transactionHash
			};
			
			const address = await resolveContractAddress(v1Contract, 'RSK', 'testnet');
			expect(address.toLowerCase()).toBe('0x1234567890123456789012345678901234567890');
		});

		it('throws error for invalid contract format', async () => {
			// Create a contract that doesn't match v1 or v2
			const invalidContract = {
				escrowId: '123',
				contractFormatVersion: 99, // Invalid version
			} as any;
			
			await expect(resolveContractAddress(invalidContract))
				.rejects.toThrow();
		});
	});

	describe('resolveContractNetwork', () => {
		it('returns stored network/environment for v2 contracts', () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'BSC',
				environment: 'mainnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				taskId: '456',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
			};
			
			const network = resolveContractNetwork(v2Contract);
			expect(network).toEqual({
				network: 'BSC',
				environment: 'mainnet',
			});
		});

		it('returns defaults for v1 contracts', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
				taskId: '456',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
			};
			
			const network = resolveContractNetwork(v1Contract);
			expect(network).toEqual({
				network: 'RSK',
				environment: 'testnet',
			});
		});
	});

	describe('getTotalPaymentUsd', () => {
		it('returns stored value for v2 contracts', () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 5500,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				taskId: '456',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
			};
			
			expect(getTotalPaymentUsd(v2Contract)).toBe(5500);
		});

		it('returns null for v1 contracts', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
				taskId: '456',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
			};
			
			expect(getTotalPaymentUsd(v1Contract)).toBeNull();
		});
	});

	describe('getBtcPriceAtCreation', () => {
		it('returns stored value for v2 contracts', () => {
			const v2Contract: NostrContractV2 = {
				contractFormatVersion: 2,
				contractAddress: '0x123...',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '123',
				taskId: '456',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
			};
			
			expect(getBtcPriceAtCreation(v2Contract)).toBe(50000);
		});

		it('returns null for v1 contracts', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '123',
				taskId: '456',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active',
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract',
			};
			
			expect(getBtcPriceAtCreation(v1Contract)).toBeNull();
		});
	});
});


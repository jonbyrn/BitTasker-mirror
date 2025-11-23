import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock problematic dependencies before importing
vi.mock('$lib/utils/nostr-message', () => ({}));
vi.mock('$lib/stores/wallet.store', () => ({}));
vi.mock('$lib/utils/wallet/escrow', () => ({}));

import { parseNostrContract } from '$lib/utils/nostr-bid';
import { resolveContractAddress, getTotalPaymentUsd, getBtcPriceAtCreation } from '$lib/utils/wallet/contractResolver';
import { isNostrContractV1, isNostrContractV2 } from '$lib/types/contract';
import type { NostrContractV1 } from '$lib/types/contract';

describe('Backward Compatibility', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_RSK_CONTRACT_ADDRESS_TESTNET', '0x1234567890123456789012345678901234567890');
	});

	describe('v1 Contract Support', () => {
		it('v1 contracts can be parsed without error', () => {
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
			
			expect(() => parseNostrContract(v1Contract)).not.toThrow();
			const parsed = parseNostrContract(v1Contract);
			expect(parsed).toBeDefined();
			expect(isNostrContractV1(parsed)).toBe(true);
		});

		it('v1 contracts can resolve address (falls back)', async () => {
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
			
			const address = await resolveContractAddress(v1Contract, 'RSK', 'testnet');
			expect(address).toBeDefined();
			expect(address.toLowerCase()).toBe('0x1234567890123456789012345678901234567890');
		});

		it('v1 contracts return null for v2-only fields', () => {
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
			expect(getBtcPriceAtCreation(v1Contract)).toBeNull();
		});
	});

	describe('Mixed v1/v2 Contract Support', () => {
		it('can handle both v1 and v2 contracts', () => {
			const v1Contract: NostrContractV1 = {
				escrowId: '1',
				taskId: '1',
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
			
			const v2Contract = {
				contractFormatVersion: 2,
				contractAddress: '0x1234567890123456789012345678901234567890',
				network: 'RSK',
				environment: 'testnet',
				totalPaymentUsd: 100,
				btcPriceAtCreation: 50000,
				escrowId: '2',
				taskId: '2',
				taskTitle: 'Test Task',
				taskDescription: 'Test Description',
				freelancerPubkey: 'npub1test',
				clientPubkey: 'npub2test',
				amount: '0.1',
				currency: 'RBTC',
				status: 'active' as const,
				createdAt: Date.now(),
				estimatedStartTime: Date.now(),
				estimatedCompletionTime: Date.now() + 86400000,
				messageType: 'contract' as const,
			};
			
			// Both should be readable and functional
			expect(isNostrContractV1(v1Contract)).toBe(true);
			expect(isNostrContractV2(v2Contract)).toBe(true);
			
			// Both should parse without error
			expect(() => parseNostrContract(v1Contract)).not.toThrow();
			expect(() => parseNostrContract(v2Contract)).not.toThrow();
		});
	});
});


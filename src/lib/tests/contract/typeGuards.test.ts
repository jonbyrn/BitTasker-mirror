import { describe, it, expect } from 'vitest';
import { isNostrContractV2, isNostrContractV1 } from '$lib/types/contract';
import type { NostrContractV1, NostrContractV2 } from '$lib/types/contract';

describe('Contract Type Guards', () => {
	describe('isNostrContractV2', () => {
		it('returns true for v2 contracts with contractFormatVersion: 2', () => {
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
			expect(isNostrContractV2(v2Contract)).toBe(true);
		});

		it('returns false for v1 contracts without contractFormatVersion', () => {
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
			expect(isNostrContractV2(v1Contract)).toBe(false);
		});

		it('returns false for v1 contracts with contractFormatVersion: 1', () => {
			const v1Contract: NostrContractV1 = {
				contractFormatVersion: 1,
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
			expect(isNostrContractV2(v1Contract)).toBe(false);
		});

		it('handles undefined contractFormatVersion gracefully', () => {
			const contract = {
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
				messageType: 'contract' as const,
			} as NostrContractV1;
			expect(isNostrContractV2(contract)).toBe(false);
		});
	});

	describe('isNostrContractV1', () => {
		it('returns true for contracts without contractFormatVersion', () => {
			const contract = {
				escrowId: '123',
				taskId: '456',
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
			} as NostrContractV1;
			expect(isNostrContractV1(contract)).toBe(true);
		});

		it('returns true for contracts with contractFormatVersion: 1', () => {
			const contract: NostrContractV1 = {
				contractFormatVersion: 1,
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
			expect(isNostrContractV1(contract)).toBe(true);
		});

		it('returns false for v2 contracts', () => {
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
			expect(isNostrContractV1(v2Contract)).toBe(false);
		});
	});
});


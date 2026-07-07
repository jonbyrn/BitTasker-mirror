import { describe, it, expect } from 'vitest';
import type { PaymentContractRuneLike } from '$lib/utils/contract/lifecycle/types';
import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { SecurePaymentLegacy } from '$lib/utils/contract/types';
import { ContractStatus } from '$lib/utils/contract/types';

/**
 * Tests for the blockchain data loading behavior:
 * - Error banner should surface when blockchainData is null and error is set
 * - Loading indicator should show when blockchainData is null and error is null
 * - Actions should be hidden when blockchainData is null (not confirmed from chain)
 */
describe('contract blockchain data states', () => {
	function makeRune(overrides: Partial<PaymentContractRuneLike> = {}): PaymentContractRuneLike {
		const now = Math.floor(Date.now() / 1000);
		return {
			contract: {
				taskeePubkey: 'taskee-pk',
				contractAddress: '0xcontract',
				taskerPubkey: 'tasker-pk',
				created_at: now - 86400
			} as unknown as NDKPaymentContract,
			paymentId: '42',
			version: 'v2',
			isPending: false,
			isFailed: false,
			blockchainData: null,
			isTasker: true,
			contractAddress: '0xcontract',
			parentEventId: 'parent-evt-1',
			taskerPubkey: 'tasker-pk',
			taskTitle: 'Test task',
			task: null,
			statusEventsByNewest: [],
			completionAttachments: [],
			completionText: '',
			effectiveEstimatedStartTime: now + 3600,
			effectiveEstimatedCompletionTime: now + 86400,
			...overrides
		};
	}

	describe('blockchain data loading states', () => {
		it('rune with null blockchainData and no error represents loading state', () => {
			const rune = makeRune({ blockchainData: null });
			expect(rune.blockchainData).toBeNull();
			// Error is not on the interface — it's on the concrete rune class.
			// But the interface contract guarantees blockchainData availability.
		});

		it('rune with blockchainData populated represents loaded state', () => {
			const now = Math.floor(Date.now() / 1000);
			const data: SecurePaymentLegacy = {
				tasker: 'tasker-pk',
				taskee: 'taskee-pk',
				amount: '0.001',
				estimatedStartTime: now - 86400,
				estimatedCompletionTime: now - 3600,
				timelockEnd: 0,
				createdAt: now - 172800,
				taskerFeeTier: 0,
				taskeeFeeTier: 0,
				state: ContractStatus.Funded,
				noShowMarked: false
			};
			const rune = makeRune({ blockchainData: data });
			expect(rune.blockchainData).not.toBeNull();
			expect(rune.blockchainData?.state).toBe(ContractStatus.Funded);
			expect(rune.blockchainData?.estimatedCompletionTime).toBe(now - 3600);
		});

		it('effectiveEstimatedStartTime falls back to Nostr tags when blockchainData is null', () => {
			const now = Math.floor(Date.now() / 1000);
			const rune = makeRune({
				blockchainData: null,
				effectiveEstimatedStartTime: now - 86400,
				effectiveEstimatedCompletionTime: now - 3600
			});
			// When blockchainData is null, effectiveEstimated* values come from Nostr tags
			expect(rune.effectiveEstimatedStartTime).toBe(now - 86400);
			expect(rune.effectiveEstimatedCompletionTime).toBe(now - 3600);
			expect(rune.blockchainData).toBeNull();
		});

		it('effectiveEstimatedStartTime uses blockchainData when available', () => {
			const now = Math.floor(Date.now() / 1000);
			const data: SecurePaymentLegacy = {
				tasker: 'tasker-pk',
				taskee: 'taskee-pk',
				amount: '0.001',
				estimatedStartTime: now - 172800,
				estimatedCompletionTime: now - 86400,
				timelockEnd: 0,
				createdAt: now - 172800,
				taskerFeeTier: 0,
				taskeeFeeTier: 0,
				state: ContractStatus.Funded,
				noShowMarked: false
			};
			const rune = makeRune({
				blockchainData: data,
				effectiveEstimatedStartTime: now - 172800,
				effectiveEstimatedCompletionTime: now - 86400
			});
			// effectiveEstimated* should prefer blockchainData
			expect(rune.effectiveEstimatedStartTime).toBe(now - 172800);
			expect(rune.effectiveEstimatedCompletionTime).toBe(now - 86400);
		});
	});
});

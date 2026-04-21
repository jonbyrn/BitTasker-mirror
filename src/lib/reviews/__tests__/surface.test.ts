import { describe, expect, it } from 'vitest';
import { buildPendingReviewState, getPendingReviewSlotKey } from '$lib/reviews';
import { EscrowStatus } from '$lib/utils/escrow/v1/escrow.enum';
import type { ContractWithEvents } from '$lib/types/contract';

function createReviewableContract(): ContractWithEvents {
	return {
		contractEvent: {
			id: 'contract-event-1',
			created_at: 1_700_000_000,
			pubkey: 'contract-author',
			kind: 30001,
			tags: [],
			content: {
				escrowId: 'contract-1',
				contextType: 'service',
				contextId: 'service-1',
				serviceId: 'service-1',
				serviceTitle: 'Brand refresh sprint',
				contextTitle: 'Brand refresh sprint',
				contextDescription: 'Design and delivery',
				clientPubkey: 'current-user',
				freelancerPubkey: 'freelancer-user',
				currency: 'RBTC',
				contractAddress: '0xcontract',
				purchaseMode: 'quote'
			}
		},
		statusEvents: [],
		isClient: true,
		blockchainStatus: EscrowStatus.FundsReleased,
		escrowData: {
			id: 'contract-1',
			client: '0xclient',
			freelancer: '0xfreelancer'
		} as ContractWithEvents['escrowData'],
		status: EscrowStatus.FundsReleased,
		isPending: false,
		permissions: {
			canComplete: false,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		},
		disputeProposal: null,
		completionAttachments: null
	} as ContractWithEvents;
}

describe('review pending dismissal state', () => {
	it('filters dismissed pending slots from the pending review state', () => {
		const contract = createReviewableContract();
		const slotKey = getPendingReviewSlotKey(contract);

		const visible = buildPendingReviewState([contract], 'current-user', new Set());
		expect(visible.records).toHaveLength(1);

		const dismissed = buildPendingReviewState([contract], 'current-user', new Set([slotKey]));
		expect(dismissed.records).toHaveLength(0);
	});
});

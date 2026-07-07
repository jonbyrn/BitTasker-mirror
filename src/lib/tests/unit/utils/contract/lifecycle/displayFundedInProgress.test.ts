import { describe, expect, it } from 'vitest';
import { applyFundedStartedInProgressDisplay } from '$lib/utils/contract/lifecycle/displayFundedInProgress';
import { permissionsNowSeconds } from '$lib/utils/contract/lifecycle/time';
import { ContractStatus, DisplayOnlyStatus } from '$lib/utils/contract/types';
import type { PaymentContractRuneLike } from '$lib/utils/contract/lifecycle/types';
import type { NDKPaymentContract } from '$lib/nostr/events/contract';

function minimalRune(overrides: Partial<PaymentContractRuneLike> = {}): PaymentContractRuneLike {
	return {
		contract: { estimatedStartTime: undefined } as NDKPaymentContract,
		paymentId: '1',
		version: 'v2',
		isPending: false,
		isFailed: false,
		blockchainData: null,
		isTasker: true,
		contractAddress: '0x',
		parentEventId: '',
		taskerPubkey: 'a',
		taskTitle: 't',
		task: null,
		statusEventsByNewest: [],
		completionAttachments: [],
		completionText: '',
		effectiveEstimatedStartTime: undefined,
		effectiveEstimatedCompletionTime: undefined,
		...overrides
	};
}

describe('applyFundedStartedInProgressDisplay', () => {
	it('returns InProgress when Funded and contract start is in the past', () => {
		const nowSec = permissionsNowSeconds();
		const r = minimalRune({
			contract: { estimatedStartTime: nowSec - 60 } as NDKPaymentContract,
			blockchainData: {
				state: ContractStatus.Funded,
				estimatedStartTime: nowSec - 60
			} as PaymentContractRuneLike['blockchainData'],
			effectiveEstimatedStartTime: nowSec - 60
		});
		expect(applyFundedStartedInProgressDisplay(ContractStatus.Funded, r)).toBe(
			DisplayOnlyStatus.InProgress
		);
	});

	it('returns Funded when start is still in the future', () => {
		const nowSec = permissionsNowSeconds();
		const r = minimalRune({
			contract: { estimatedStartTime: nowSec + 3600 } as NDKPaymentContract,
			effectiveEstimatedStartTime: nowSec + 3600
		});
		expect(applyFundedStartedInProgressDisplay(ContractStatus.Funded, r)).toBe(
			ContractStatus.Funded
		);
	});

	it('does not override non-Funded statuses', () => {
		const r = minimalRune({
			contract: { estimatedStartTime: 0 } as NDKPaymentContract,
			effectiveEstimatedStartTime: 0
		});
		expect(applyFundedStartedInProgressDisplay(ContractStatus.Completed, r)).toBe(
			ContractStatus.Completed
		);
	});

	it('uses blockchainData estimatedStartTime when tag is missing', () => {
		const nowSec = permissionsNowSeconds();
		const r = minimalRune({
			contract: { estimatedStartTime: undefined } as NDKPaymentContract,
			blockchainData: {
				state: ContractStatus.Funded,
				estimatedStartTime: nowSec - 10
			} as PaymentContractRuneLike['blockchainData'],
			effectiveEstimatedStartTime: nowSec - 10
		});
		expect(applyFundedStartedInProgressDisplay(ContractStatus.Funded, r)).toBe(
			DisplayOnlyStatus.InProgress
		);
	});
});

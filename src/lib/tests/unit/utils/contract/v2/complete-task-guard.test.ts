import { describe, expect, it, beforeEach } from 'vitest';
import { ContractStatus } from '$lib/utils/contract/types';
import { completeTaskErrorKey } from '$lib/utils/contract/completeTaskFailure';
import {
	decideCompleteRetry,
	endCompleteSend,
	loadCompleteGuardSnapshot,
	noteCompleteTxHash,
	resetCompleteTaskGuard,
	tryBeginCompleteSend,
	type CompleteGuardSnapshot
} from '$lib/utils/contract/v2/completeTaskGuard';

function snapshot(overrides: Partial<CompleteGuardSnapshot> = {}): CompleteGuardSnapshot {
	return {
		localSendInFlight: false,
		storedTxHash: null,
		receiptStatus: null,
		chainState: ContractStatus.Funded,
		chainCheckComplete: true,
		...overrides
	};
}

describe('complete task retry guard', () => {
	beforeEach(() => {
		resetCompleteTaskGuard();
	});

	it('checks on-chain state before allowing another completeTask', () => {
		expect(decideCompleteRetry(snapshot({ localSendInFlight: true }))).toEqual({
			action: 'block',
			reason: 'in_flight'
		});
		expect(
			decideCompleteRetry(
				snapshot({
					storedTxHash: '0x6fefdb19',
					receiptStatus: null,
					chainState: ContractStatus.Funded
				})
			)
		).toEqual({ action: 'block', reason: 'pending' });
		expect(
			decideCompleteRetry(
				snapshot({
					storedTxHash: '0x6fefdb19',
					receiptStatus: 1,
					chainState: ContractStatus.Funded
				})
			)
		).toEqual({ action: 'finish', reason: 'already_complete' });
		expect(
			decideCompleteRetry(snapshot({ chainState: ContractStatus.Completed, storedTxHash: null }))
		).toEqual({ action: 'finish', reason: 'already_complete' });
		expect(
			decideCompleteRetry(
				snapshot({
					chainState: ContractStatus.FundsReleased,
					storedTxHash: '0xrel',
					receiptStatus: null
				})
			)
		).toEqual({ action: 'finish', reason: 'already_complete' });
		expect(
			decideCompleteRetry(
				snapshot({
					storedTxHash: '0x6fefdb19',
					receiptStatus: 0,
					chainState: ContractStatus.Funded
				})
			)
		).toEqual({ action: 'allow' });
		expect(decideCompleteRetry(snapshot({ chainState: ContractStatus.InDispute }))).toEqual({
			action: 'block',
			reason: 'not_completable'
		});
		expect(
			decideCompleteRetry(
				snapshot({ chainState: 'InDispute' as unknown as number, chainCheckComplete: true })
			)
		).toEqual({ action: 'allow' });
		expect(decideCompleteRetry(snapshot())).toEqual({ action: 'allow' });
		expect(completeTaskErrorKey('pending')).toBe(
			'dashboard.contracts.timeline.completion.error_pending'
		);
		expect(completeTaskErrorKey('in_flight')).toBe(
			'dashboard.contracts.timeline.completion.error_in_flight'
		);
	});

	it('holds a synchronous lock so two sends cannot both pass', () => {
		expect(tryBeginCompleteSend('42')).toBe(true);
		expect(tryBeginCompleteSend('42')).toBe(false);
		endCompleteSend('42');
		expect(tryBeginCompleteSend('42')).toBe(true);
		endCompleteSend('42');
	});

	it('loads the chain and the saved hash before the decision', async () => {
		noteCompleteTxHash('42', '0x6fefdb19dd8d');
		const loaded = await loadCompleteGuardSnapshot({
			paymentId: '42',
			readChainState: async () => ({ ok: true, state: ContractStatus.Funded }),
			readReceipt: async () => null
		});
		expect(decideCompleteRetry(loaded)).toEqual({ action: 'block', reason: 'pending' });

		const mined = await loadCompleteGuardSnapshot({
			paymentId: '42',
			readChainState: async () => ({ ok: true, state: ContractStatus.Completed }),
			readReceipt: async () => ({ status: 1 })
		});
		expect(decideCompleteRetry(mined)).toEqual({ action: 'finish', reason: 'already_complete' });
	});
});

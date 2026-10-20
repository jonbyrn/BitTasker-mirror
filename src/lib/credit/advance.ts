import {
	cancellationSplit,
	completionSplit,
	legAmount,
	type PayoutSplit
} from '$lib/escrow/payoutSplit';
import { assertCreditNetwork } from './network';
import { quoteAdvance } from './policy';
import {
	CreditDenied,
	IllegalAdvanceTransition,
	type AdvanceRecord,
	type CreditPolicy,
	type EscrowSnapshot,
	type ReputationSummary
} from './types';

export type AdvanceAction =
	| { type: 'offer'; lenderPubkey: string; advanceCents: number; feeCents: number }
	| { type: 'accept' }
	| { type: 'note-funding'; txid: string }
	| { type: 'confirm-funding'; txid: string; confirmations: number }
	| { type: 'repay'; split: PayoutSplit }
	| { type: 'default'; split: PayoutSplit }
	| { type: 'cancel' };

function next(record: AdvanceRecord, patch: Partial<AdvanceRecord>, now: number): AdvanceRecord {
	return { ...record, ...patch, updatedAt: now };
}

function denyTransition(record: AdvanceRecord, action: string): never {
	throw new IllegalAdvanceTransition(record.status, action);
}

export function escrowIsFunded(escrow: EscrowSnapshot): boolean {
	return (
		escrow.asset === 'usdt_rgb' &&
		escrow.confirmations >= 1 &&
		Boolean(escrow.fundingTxid && escrow.fundingTxid.trim())
	);
}

/** Opens a request. The escrow must already have at least one confirmation. */
export function createAdvanceOnNetwork(input: {
	id: string;
	escrow: EscrowSnapshot;
	reputation: ReputationSummary;
	policy: CreditPolicy;
	network: AdvanceRecord['network'];
	now: number;
}): AdvanceRecord {
	assertCreditNetwork(input.network);
	if (!input.policy.allowedNetworks.includes(input.network)) {
		throw new CreditDenied('This network is not enabled for BitTasker Credit');
	}
	if (!escrowIsFunded(input.escrow)) {
		throw new CreditDenied('Escrow is not funded until the funding transaction has a confirmation');
	}
	if (input.reputation.subjectPubkey !== input.escrow.workerPubkey) {
		throw new CreditDenied('Reputation is scored for the worker on this escrow');
	}
	const quote = quoteAdvance(
		input.policy,
		input.reputation,
		input.escrow.amountCents,
		input.network
	);
	if (quote.advanceCents <= 0) {
		throw new CreditDenied('This account cannot take an advance yet');
	}
	return {
		id: input.id,
		jobId: input.escrow.jobId,
		escrowId: input.escrow.escrowId,
		network: input.network,
		workerPubkey: input.escrow.workerPubkey,
		hirerPubkey: input.escrow.hirerPubkey,
		escrowAmountCents: input.escrow.amountCents,
		advanceAmountCents: quote.advanceCents,
		feeAmountCents: quote.feeCents,
		status: 'requested',
		fundingConfirmations: 0,
		createdAt: input.now,
		updatedAt: input.now
	};
}

function assertSplitCoversEscrow(record: AdvanceRecord, split: PayoutSplit): void {
	if (split.escrowCents !== record.escrowAmountCents) {
		throw new Error('Split is for a different escrow amount');
	}
}

/** Apply one transition. Illegal moves throw and leave the caller holding the old record. */
export function applyAdvance(
	record: AdvanceRecord,
	action: AdvanceAction,
	now: number
): AdvanceRecord {
	switch (action.type) {
		case 'offer': {
			if (record.status !== 'requested') denyTransition(record, 'offer');
			if (!/^[0-9a-f]{64}$/i.test(action.lenderPubkey)) {
				throw new Error('Lender pubkey is not valid');
			}
			if (action.lenderPubkey === record.workerPubkey) {
				throw new CreditDenied('The worker cannot lend to their own advance');
			}
			if (action.advanceCents !== record.advanceAmountCents) {
				throw new CreditDenied('Offer must match the capped advance');
			}
			if (action.feeCents !== record.feeAmountCents) {
				throw new CreditDenied('Offer fee does not match the policy fee');
			}
			return next(
				record,
				{ status: 'offered', lenderPubkey: action.lenderPubkey.toLowerCase() },
				now
			);
		}
		case 'accept': {
			if (record.status !== 'offered' || !record.lenderPubkey) denyTransition(record, 'accept');
			return next(record, { status: 'accepted' }, now);
		}
		case 'note-funding': {
			if (record.status !== 'accepted') denyTransition(record, 'note-funding');
			if (record.fundingTxid) denyTransition(record, 'note-funding');
			if (!/^[0-9a-f]{64}$/i.test(action.txid)) throw new Error('Funding txid is not valid');
			return next(record, { fundingTxid: action.txid.toLowerCase(), fundingConfirmations: 0 }, now);
		}
		case 'confirm-funding': {
			if (record.status !== 'accepted') denyTransition(record, 'confirm-funding');
			if (!record.fundingTxid || action.txid.toLowerCase() !== record.fundingTxid) {
				throw new CreditDenied('Confirmation is for a different transaction');
			}
			if (!Number.isSafeInteger(action.confirmations) || action.confirmations < 1) {
				throw new CreditDenied('Advance stays unfunded until the transfer has a confirmation');
			}
			return next(record, { status: 'funded', fundingConfirmations: action.confirmations }, now);
		}
		case 'repay': {
			if (record.status !== 'funded' || !record.lenderPubkey) denyTransition(record, 'repay');
			assertSplitCoversEscrow(record, action.split);
			const expected = completionSplit({
				escrowCents: record.escrowAmountCents,
				advanceCents: record.advanceAmountCents,
				feeCents: record.feeAmountCents,
				lenderPubkey: record.lenderPubkey,
				workerPubkey: record.workerPubkey
			});
			if (legAmount(action.split, 'lender') !== legAmount(expected, 'lender')) {
				throw new CreditDenied('Lender must be repaid the advance and the fee first');
			}
			if (legAmount(action.split, 'worker') !== legAmount(expected, 'worker')) {
				throw new CreditDenied('Worker remainder does not match the escrow');
			}
			return next(record, { status: 'repaid' }, now);
		}
		case 'default': {
			if (record.status !== 'funded') denyTransition(record, 'default');
			assertSplitCoversEscrow(record, action.split);
			const expected = cancellationSplit({
				escrowCents: record.escrowAmountCents,
				hirerPubkey: record.hirerPubkey
			});
			if (legAmount(action.split, 'hirer') !== legAmount(expected, 'hirer')) {
				throw new CreditDenied('Hirer refund must be the full escrow');
			}
			if (legAmount(action.split, 'lender') !== 0) {
				throw new CreditDenied('Lender is not repaid when the job is cancelled');
			}
			return next(record, { status: 'defaulted' }, now);
		}
		case 'cancel': {
			if (
				record.status !== 'requested' &&
				record.status !== 'offered' &&
				record.status !== 'accepted'
			) {
				denyTransition(record, 'cancel');
			}
			if (record.fundingTxid) {
				throw new CreditDenied('A broadcast advance cannot be cancelled. Wait for confirmation.');
			}
			return next(record, { status: 'cancelled' }, now);
		}
		default:
			return denyTransition(record, 'unknown');
	}
}

/** What the screen is allowed to call the advance. Broadcast alone is not funded. */
export function displayStatus(record: AdvanceRecord): AdvanceStatus | 'waiting-for-confirmation' {
	if (record.status === 'accepted' && record.fundingTxid && record.fundingConfirmations < 1) {
		return 'waiting-for-confirmation';
	}
	return record.status;
}

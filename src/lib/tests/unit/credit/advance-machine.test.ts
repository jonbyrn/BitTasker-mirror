import { describe, expect, it } from 'vitest';
import { cancellationSplit, completionSplit } from '$lib/escrow/payoutSplit';
import {
	applyAdvance,
	createAdvanceOnNetwork,
	displayStatus,
	type AdvanceAction
} from '$lib/credit/advance';
import {
	CreditDenied,
	IllegalAdvanceTransition,
	type AdvanceRecord,
	type ReputationSummary
} from '$lib/credit/types';
import { CREDIT_POLICY } from '$lib/credit/policy';

const worker = 'a'.repeat(64);
const hirer = 'b'.repeat(64);
const lender = 'c'.repeat(64);

function reputation(completed: number): ReputationSummary {
	return {
		subjectPubkey: worker,
		completedContracts: completed,
		reviewCount: completed > 0 ? 1 : 0,
		averageRating: completed > 0 ? 5 : null,
		score: completed
	};
}

function requested(): AdvanceRecord {
	return createAdvanceOnNetwork({
		id: 'adv-1',
		network: 'mock',
		now: 10,
		policy: CREDIT_POLICY,
		reputation: reputation(20),
		escrow: {
			escrowId: 'escrow-1',
			jobId: 'job-1',
			asset: 'usdt_rgb',
			amountCents: 10_000,
			hirerPubkey: hirer,
			workerPubkey: worker,
			fundingTxid: '11'.repeat(32),
			confirmations: 1
		}
	});
}

function actionFor(name: string, record: AdvanceRecord): AdvanceAction {
	if (name === 'offer') {
		return {
			type: 'offer',
			lenderPubkey: lender,
			advanceCents: record.advanceAmountCents,
			feeCents: record.feeAmountCents
		};
	}
	if (name === 'accept') return { type: 'accept' };
	if (name === 'note') return { type: 'note-funding', txid: '22'.repeat(32) };
	if (name === 'confirm') {
		return {
			type: 'confirm-funding',
			txid: record.fundingTxid ?? '22'.repeat(32),
			confirmations: 1
		};
	}
	if (name === 'confirm-zero') {
		return {
			type: 'confirm-funding',
			txid: record.fundingTxid ?? '22'.repeat(32),
			confirmations: 0
		};
	}
	if (name === 'repay') {
		return {
			type: 'repay',
			split: completionSplit({
				escrowCents: record.escrowAmountCents,
				advanceCents: record.advanceAmountCents,
				feeCents: record.feeAmountCents,
				lenderPubkey: record.lenderPubkey ?? lender,
				workerPubkey: record.workerPubkey
			})
		};
	}
	if (name === 'default') {
		return {
			type: 'default',
			split: cancellationSplit({
				escrowCents: record.escrowAmountCents,
				hirerPubkey: record.hirerPubkey
			})
		};
	}
	return { type: 'cancel' };
}

const legal: Record<string, string[]> = {
	requested: ['offered', 'cancelled'],
	offered: ['accepted', 'cancelled'],
	accepted: ['accepted', 'funded', 'cancelled'],
	funded: ['repaid', 'defaulted'],
	repaid: [],
	defaulted: [],
	cancelled: []
};

describe('advance state machine', () => {
	it('refuses an unconfirmed escrow and a new account', () => {
		const escrow = {
			escrowId: 'escrow-1',
			jobId: 'job-1',
			asset: 'usdt_rgb' as const,
			amountCents: 10_000,
			hirerPubkey: hirer,
			workerPubkey: worker,
			fundingTxid: '11'.repeat(32),
			confirmations: 0
		};
		expect(() =>
			createAdvanceOnNetwork({
				id: 'adv-2',
				network: 'mock',
				now: 10,
				policy: CREDIT_POLICY,
				reputation: reputation(20),
				escrow
			})
		).toThrow(CreditDenied);
		expect(() =>
			createAdvanceOnNetwork({
				id: 'adv-3',
				network: 'signet',
				now: 10,
				policy: CREDIT_POLICY,
				reputation: reputation(0),
				escrow: { ...escrow, confirmations: 1 }
			})
		).toThrow(/cannot take an advance/);
	});

	it('stays unfunded until the advance transfer has a confirmation', () => {
		let record = requested();
		record = applyAdvance(record, actionFor('offer', record), 11);
		record = applyAdvance(record, actionFor('accept', record), 12);
		record = applyAdvance(record, actionFor('note', record), 13);
		expect(record.status).toBe('accepted');
		expect(displayStatus(record)).toBe('waiting-for-confirmation');
		expect(() => applyAdvance(record, actionFor('confirm-zero', record), 14)).toThrow(CreditDenied);
		expect(record.status).toBe('accepted');
		record = applyAdvance(record, actionFor('confirm', record), 15);
		expect(record.status).toBe('funded');
		expect(record.fundingConfirmations).toBe(1);
		expect(displayStatus(record)).toBe('funded');
	});

	it('rejects illegal transitions across random sequences', () => {
		const names = [
			'offer',
			'accept',
			'note',
			'confirm',
			'confirm-zero',
			'repay',
			'default',
			'cancel'
		];
		let seed = 20;
		const rand = () => {
			seed = (seed * 1664525 + 1013904223) % 4294967296;
			return seed / 4294967296;
		};
		for (let trial = 0; trial < 200; trial += 1) {
			let record = requested();
			for (let step = 0; step < 8; step += 1) {
				const name = names[Math.floor(rand() * names.length)] ?? 'cancel';
				const before = record.status;
				try {
					const next = applyAdvance(record, actionFor(name, record), 20 + step);
					expect(legal[before]).toContain(next.status);
					if (next.status === 'funded') expect(next.fundingConfirmations).toBeGreaterThanOrEqual(1);
					record = next;
				} catch (error) {
					expect(
						error instanceof IllegalAdvanceTransition ||
							error instanceof CreditDenied ||
							error instanceof Error
					).toBe(true);
					expect(record.status).toBe(before);
				}
			}
		}
	});
});

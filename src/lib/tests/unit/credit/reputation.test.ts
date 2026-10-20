import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { describe, expect, it } from 'vitest';
import {
	receiptsFromCreditEvents,
	reviewsFromVerifiedEvents,
	signCreditEvent,
	signPlainReview
} from '$lib/credit/events';
import { completedContractIds, scoreReputation } from '$lib/credit/reputation';

const workerSecret = generateSecretKey();
const hirerSecret = generateSecretKey();
const worker = getPublicKey(workerSecret);
const hirer = getPublicKey(hirerSecret);

function bothReceipts(contractId: string) {
	const taskee = signCreditEvent(
		{
			type: 'job_receipt',
			network: 'mock',
			contractId,
			role: 'taskee',
			counterparty: hirer
		},
		workerSecret,
		1_700_000_000
	);
	const tasker = signCreditEvent(
		{
			type: 'job_receipt',
			network: 'mock',
			contractId,
			role: 'tasker',
			counterparty: worker
		},
		hirerSecret,
		1_700_000_001
	);
	return [taskee, tasker];
}

describe('scoreReputation', () => {
	it('is deterministic and ignores a contract signed by only one party', () => {
		const [taskee] = bothReceipts('only-one');
		const receipts = receiptsFromCreditEvents([taskee]);
		const first = scoreReputation({ subjectPubkey: worker, receipts, reviews: [] });
		const second = scoreReputation({ subjectPubkey: worker, receipts, reviews: [] });
		expect(first).toEqual(second);
		expect(first.completedContracts).toBe(0);
		expect(completedContractIds(worker, receipts)).toEqual([]);
	});

	it('counts a contract once when both parties signed and drops a bad signature', () => {
		const events = [...bothReceipts('job-a'), ...bothReceipts('job-a')];
		const broken = bothReceipts('job-b')[0];
		const tampered = {
			...broken,
			sig: `${broken.sig.slice(0, -1)}${broken.sig.endsWith('a') ? 'b' : 'a'}`
		};
		const receipts = receiptsFromCreditEvents([...events, tampered]);
		expect(receipts.every((receipt) => receipt.contractId === 'job-a')).toBe(true);
		expect(receipts).toHaveLength(4);
		const summary = scoreReputation({ subjectPubkey: worker, receipts, reviews: [] });
		expect(summary.completedContracts).toBe(1);
		expect(summary.score).toBe(Math.round((1 / 50) * 70));
	});

	it('averages valid reviews and ignores a self-review', () => {
		const good = signPlainReview({
			reviewer: { secret: hirerSecret, pubkey: hirer },
			revieweePubkey: worker,
			rating: 5,
			contractId: 'job-a',
			createdAt: 1_700_000_010
		});
		const mid = signPlainReview({
			reviewer: { secret: hirerSecret, pubkey: hirer },
			revieweePubkey: worker,
			rating: 4,
			contractId: 'job-b',
			createdAt: 1_700_000_011
		});
		const self = signPlainReview({
			reviewer: { secret: workerSecret, pubkey: worker },
			revieweePubkey: worker,
			rating: 5,
			contractId: 'job-c',
			createdAt: 1_700_000_012
		});
		const reviews = reviewsFromVerifiedEvents([good, mid, self]);
		const summary = scoreReputation({
			subjectPubkey: worker,
			receipts: receiptsFromCreditEvents(bothReceipts('job-a')),
			reviews
		});
		expect(summary.reviewCount).toBe(2);
		expect(summary.averageRating).toBe(4.5);
	});
});

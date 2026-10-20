import { describe, expect, it } from 'vitest';
import { CREDIT_POLICY, advancePercent, assertWithinQuote, quoteAdvance } from '$lib/credit/policy';
import { scoreReputation } from '$lib/credit/reputation';
import type { ReputationSummary } from '$lib/credit/types';

function summary(patch: Partial<ReputationSummary>): ReputationSummary {
	return {
		subjectPubkey: 'worker',
		completedContracts: 0,
		reviewCount: 0,
		averageRating: null,
		score: 0,
		...patch
	};
}

describe('quoteAdvance', () => {
	it('gives a new account 0%', () => {
		const reputation = scoreReputation({ subjectPubkey: 'worker', receipts: [], reviews: [] });
		expect(reputation.completedContracts).toBe(0);
		const quote = quoteAdvance(CREDIT_POLICY, reputation, 10_000, 'signet');
		expect(quote.percent).toBe(0);
		expect(quote.advanceCents).toBe(0);
		expect(quote.cappedBy).toBe('zero');
	});

	it('does not let a high score override zero completed jobs', () => {
		const quote = quoteAdvance(
			CREDIT_POLICY,
			summary({ completedContracts: 0, score: 100, averageRating: 5 }),
			10_000,
			'mock'
		);
		expect(quote.percent).toBe(0);
		expect(advancePercent(CREDIT_POLICY, summary({ completedContracts: 0, score: 100 }))).toBe(0);
	});

	it('follows the published tiers and dollar caps', () => {
		expect(advancePercent(CREDIT_POLICY, summary({ completedContracts: 4 }))).toBe(0);
		expect(advancePercent(CREDIT_POLICY, summary({ completedContracts: 5 }))).toBe(20);
		expect(advancePercent(CREDIT_POLICY, summary({ completedContracts: 20 }))).toBe(40);
		expect(
			advancePercent(CREDIT_POLICY, summary({ completedContracts: 50, averageRating: 4.8 }))
		).toBe(60);
		expect(
			advancePercent(CREDIT_POLICY, summary({ completedContracts: 50, averageRating: 4.7 }))
		).toBe(40);

		const twenty = quoteAdvance(
			CREDIT_POLICY,
			summary({ completedContracts: 5 }),
			10_000,
			'signet'
		);
		expect(twenty.advanceCents).toBe(2_000);
		expect(twenty.feeCents).toBe(20);
		expect(twenty.repaymentCents + twenty.workerRemainderCents).toBe(10_000);

		const belowMin = quoteAdvance(
			CREDIT_POLICY,
			summary({ completedContracts: 5 }),
			3_000,
			'regtest'
		);
		expect(belowMin.advanceCents).toBe(0);
		expect(belowMin.cappedBy).toBe('min');

		const capped = quoteAdvance(
			CREDIT_POLICY,
			summary({ completedContracts: 50, averageRating: 4.9 }),
			500_000,
			'signet'
		);
		expect(capped.advanceCents).toBe(CREDIT_POLICY.maxAdvanceCents);
		expect(capped.cappedBy).toBe('max');
		expect(capped.repaymentCents).toBeLessThanOrEqual(500_000);
	});

	it('rejects an advance above the cap and mainnet', () => {
		const quote = quoteAdvance(CREDIT_POLICY, summary({ completedContracts: 20 }), 10_000, 'mock');
		expect(() =>
			assertWithinQuote(quote, quote.advanceCents + 1, 100, CREDIT_POLICY.maxFeeBps)
		).toThrow(/cap/);
		expect(() =>
			quoteAdvance(
				CREDIT_POLICY,
				summary({ completedContracts: 20 }),
				10_000,
				'mainnet' as 'signet'
			)
		).toThrow(/signet/);
	});
});

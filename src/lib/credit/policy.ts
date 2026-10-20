import rawPolicy from './policy.config.json';
import { feeOnAdvance } from './money';
import { assertCreditNetwork } from './network';
import type { AdvanceQuote, CreditNetwork, CreditPolicy, ReputationSummary } from './types';

function isPolicy(value: unknown): value is CreditPolicy {
	if (!value || typeof value !== 'object') return false;
	const row = value as CreditPolicy;
	return (
		row.version === 1 &&
		Number.isSafeInteger(row.feeBps) &&
		Number.isSafeInteger(row.maxFeeBps) &&
		Number.isSafeInteger(row.minAdvanceCents) &&
		Number.isSafeInteger(row.maxAdvanceCents) &&
		Array.isArray(row.allowedNetworks) &&
		Array.isArray(row.tiers)
	);
}

export function parsePolicy(value: unknown): CreditPolicy {
	if (!isPolicy(value)) throw new Error('Credit policy config is not valid');
	const tiers = [...value.tiers].sort((a, b) => {
		if (b.minCompleted !== a.minCompleted) return b.minCompleted - a.minCompleted;
		return b.minRating - a.minRating;
	});
	return { ...value, tiers };
}

export const CREDIT_POLICY: CreditPolicy = parsePolicy(rawPolicy);

/**
 * Highest tier the worker has earned.
 * A high score cannot raise the percent. Zero completed contracts stay at 0%.
 */
export function advancePercent(policy: CreditPolicy, reputation: ReputationSummary): number {
	const rating = reputation.averageRating;
	for (const tier of policy.tiers) {
		if (reputation.completedContracts < tier.minCompleted) continue;
		if (tier.minRating > 0 && (rating == null || rating < tier.minRating)) continue;
		return tier.maxAdvancePercent;
	}
	return 0;
}

function repaymentOf(advanceCents: number, feeBps: number): number {
	return advanceCents + feeOnAdvance(advanceCents, feeBps);
}

/**
 * Largest advance that fits the percent, the dollar cap, the minimum, and the escrow.
 * The lender's repayment (advance + fee) is never larger than the escrow.
 */
export function quoteAdvance(
	policy: CreditPolicy,
	reputation: ReputationSummary,
	escrowCents: number,
	network: CreditNetwork
): AdvanceQuote {
	assertCreditNetwork(network);
	if (!policy.allowedNetworks.includes(network)) {
		throw new Error('This network is not enabled for BitTasker Credit');
	}
	if (!Number.isSafeInteger(escrowCents) || escrowCents <= 0) {
		throw new Error('Escrow amount must be a positive number of cents');
	}
	const percent = advancePercent(policy, reputation);
	if (percent <= 0 || reputation.completedContracts <= 0) {
		return {
			percent: 0,
			advanceCents: 0,
			feeCents: 0,
			repaymentCents: 0,
			workerRemainderCents: escrowCents,
			cappedBy: 'zero'
		};
	}
	let advanceCents = Math.floor((escrowCents * percent) / 100);
	let cappedBy: AdvanceQuote['cappedBy'] = 'percent';
	if (advanceCents > policy.maxAdvanceCents) {
		advanceCents = policy.maxAdvanceCents;
		cappedBy = 'max';
	}
	while (advanceCents > 0 && repaymentOf(advanceCents, policy.feeBps) > escrowCents) {
		advanceCents -= 1;
	}
	if (advanceCents < policy.minAdvanceCents) {
		return {
			percent,
			advanceCents: 0,
			feeCents: 0,
			repaymentCents: 0,
			workerRemainderCents: escrowCents,
			cappedBy: 'min'
		};
	}
	const feeCents = feeOnAdvance(advanceCents, policy.feeBps);
	const repaymentCents = advanceCents + feeCents;
	return {
		percent,
		advanceCents,
		feeCents,
		repaymentCents,
		workerRemainderCents: escrowCents - repaymentCents,
		cappedBy
	};
}

export function assertWithinQuote(
	quote: AdvanceQuote,
	advanceCents: number,
	feeBps: number,
	maxFeeBps: number
): void {
	if (!Number.isSafeInteger(advanceCents) || advanceCents <= 0) {
		throw new Error('Advance must be greater than zero');
	}
	if (advanceCents > quote.advanceCents) {
		throw new Error('Advance is above the reputation cap');
	}
	if (!Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > maxFeeBps) {
		throw new Error('Fee is above the configured maximum');
	}
}

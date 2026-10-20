import type { ReputationSummary } from './types';

export interface JobReceiptInput {
	contractId: string;
	pubkey: string;
	counterparty: string;
	role: 'tasker' | 'taskee';
	signatureValid: boolean;
}

export interface ReviewInput {
	id: string;
	revieweePubkey: string;
	reviewerPubkey: string;
	/** 1–5 overall rating. */
	rating: number;
	signatureValid: boolean;
}

export interface ReputationInput {
	subjectPubkey: string;
	receipts: JobReceiptInput[];
	reviews: ReviewInput[];
}

function pairKey(contractId: string, taskee: string, tasker: string): string {
	return `${contractId}:${taskee}:${tasker}`;
}

/**
 * A contract counts once, and only when both parties signed the receipt
 * and each names the other. Invalid signatures are ignored.
 */
export function completedContractIds(subjectPubkey: string, receipts: JobReceiptInput[]): string[] {
	const taskeeSide = new Set<string>();
	const taskerSide = new Set<string>();
	const contractOf = new Map<string, string>();
	for (const receipt of receipts) {
		if (!receipt.signatureValid) continue;
		if (!receipt.contractId || !receipt.pubkey || !receipt.counterparty) continue;
		if (receipt.pubkey === receipt.counterparty) continue;
		if (receipt.role === 'taskee' && receipt.pubkey === subjectPubkey) {
			const key = pairKey(receipt.contractId, receipt.pubkey, receipt.counterparty);
			taskeeSide.add(key);
			contractOf.set(key, receipt.contractId);
		}
		if (receipt.role === 'tasker' && receipt.counterparty === subjectPubkey) {
			const key = pairKey(receipt.contractId, receipt.counterparty, receipt.pubkey);
			taskerSide.add(key);
			contractOf.set(key, receipt.contractId);
		}
	}
	const ids = new Set<string>();
	for (const key of taskeeSide) {
		if (!taskerSide.has(key)) continue;
		const contractId = contractOf.get(key);
		if (contractId) ids.add(contractId);
	}
	return [...ids].sort();
}

function validRatings(subjectPubkey: string, reviews: ReviewInput[]): number[] {
	const seen = new Set<string>();
	const ratings: number[] = [];
	for (const review of reviews) {
		if (!review.signatureValid || seen.has(review.id)) continue;
		if (review.revieweePubkey !== subjectPubkey) continue;
		if (review.reviewerPubkey === subjectPubkey) continue;
		if (!Number.isFinite(review.rating) || review.rating < 1 || review.rating > 5) continue;
		seen.add(review.id);
		ratings.push(review.rating);
	}
	return ratings;
}

/** Pure score. The same inputs always return the same summary. */
export function scoreReputation(input: ReputationInput): ReputationSummary {
	const completed = completedContractIds(input.subjectPubkey, input.receipts);
	const ratings = validRatings(input.subjectPubkey, input.reviews);
	const averageRating =
		ratings.length === 0
			? null
			: Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 100) / 100;
	const completedScore = Math.round((Math.min(completed.length, 50) / 50) * 70);
	const ratingScore = averageRating == null ? 0 : Math.round((Math.min(averageRating, 5) / 5) * 30);
	return {
		subjectPubkey: input.subjectPubkey,
		completedContracts: completed.length,
		reviewCount: ratings.length,
		averageRating,
		score: Math.min(100, completedScore + ratingScore)
	};
}

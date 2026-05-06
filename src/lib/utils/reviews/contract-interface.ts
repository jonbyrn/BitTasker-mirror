import type { ReviewSettlementType, ReviewChain, ReviewAsset } from '@bittasker/reviews-contracts';

/**
 * Version-agnostic contract interface for review operations.
 * Every contract version (v2, v3, v4...) provides an adapter implementing this interface.
 * The review system depends on this interface, not on concrete contract types.
 */
export interface IContractForReview {
	readonly contractId: string;
	readonly txHash?: string;
	readonly status: string;
	readonly clientPubkey: string;
	readonly freelancerPubkey: string;
	readonly settlementType: ReviewSettlementType;
	readonly chain: ReviewChain;
	readonly asset: ReviewAsset;
	readonly contractAddress: string;
	readonly contractVersion: string;

	isReviewable(): boolean;
	getReviewableParty(currentUserPubkey: string): 'client' | 'freelancer' | null;
}

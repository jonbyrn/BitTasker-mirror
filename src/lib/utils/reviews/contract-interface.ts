/**
 * Settlement type for reviews - matches @bittasker/reviews-contracts
 */
export type ReviewSettlementType = 'escrow' | 'service_quote_contract' | 'instant_buy_contract';

/**
 * Chain type for reviews - matches @bittasker/reviews-contracts
 */
export type ReviewChain = 'rsk' | 'liquid' | 'lightning';

/**
 * Asset type for reviews - matches @bittasker/reviews-contracts
 */
export type ReviewAsset = 'rbtc' | 'usdt' | 'btc';

/**
 * Version-agnostic contract interface for review operations.
 * Every contract type provides an adapter implementing this interface.
 * The review system depends on this interface, not on concrete contract types.
 *
 * Differentiation is based on `settlementType` (escrow, service_quote_contract, instant_buy_contract),
 * NOT on version numbers.
 */
export interface IContractForReview {
	/** Nostr event ID of the contract — used for NDK `#e` tag queries. */
	readonly contractId: string;
	/** Numeric on-chain escrow/payment ID — used by the attestation verifier. */
	readonly paymentId: string;
	readonly txHash?: string;
	readonly status: string;
	readonly clientPubkey: string;
	readonly freelancerPubkey: string;
	/** The settlement type is the primary differentiator for contract behavior */
	readonly settlementType: ReviewSettlementType;
	readonly chain: ReviewChain;
	readonly asset: ReviewAsset;
	readonly contractAddress: string;
	/** Task or service title from the payment contract (Kind 30006), for display in lists. */
	readonly taskTitle: string;
	/** Short description from the contract, when present. */
	readonly taskDescription: string;
	/**
	 * Last-known RSK addresses from chain (`getEscrow` / payment contract), tasker = client.
	 * Needed for review attestation (`revieweeWallet` / `reviewerWallet` must match on-chain parties).
	 */
	readonly taskerWalletAddress?: string;
	readonly taskeeWalletAddress?: string;
	/**
	 * @deprecated Use `settlementType` to differentiate contract behavior instead.
	 * This field will be removed in a future version.
	 */
	readonly contractVersion?: string;

	isReviewable(): boolean;
	getReviewableParty(currentUserPubkey: string): 'client' | 'freelancer' | null;
}

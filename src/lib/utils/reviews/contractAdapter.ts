import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { IContractForReview } from './contract-interface';
import { isReviewableStatus } from './status-mapper';

/**
 * Adapts an NDKPaymentContract (v2+) to the version-agnostic IContractForReview interface.
 */
export function adaptV2Contract(contract: NDKPaymentContract): IContractForReview {
	return {
		get contractId() {
			return contract.paymentId ?? '';
		},

		get txHash() {
			return contract.transactionHash;
		},

		get status() {
			return contract.status ?? '';
		},

		get clientPubkey() {
			return contract.taskerPubkey ?? '';
		},

		get freelancerPubkey() {
			return contract.taskeePubkey ?? '';
		},

		get settlementType() {
			return 'escrow' as const;
		},

		get chain() {
			return 'rsk' as const;
		},

		get asset() {
			return 'rbtc' as const;
		},

		get contractAddress() {
			return contract.contractAddress ?? '';
		},

		get contractVersion() {
			return contract.version ?? '2';
		},

		isReviewable() {
			return isReviewableStatus(contract.status);
		},

		getReviewableParty(currentUserPubkey: string) {
			const normalized = currentUserPubkey.toLowerCase();
			const tasker = (contract.taskerPubkey ?? '').toLowerCase();
			const taskee = (contract.taskeePubkey ?? '').toLowerCase();

			if (normalized === tasker) return 'client';
			if (normalized === taskee) return 'freelancer';
			return null;
		}
	};
}

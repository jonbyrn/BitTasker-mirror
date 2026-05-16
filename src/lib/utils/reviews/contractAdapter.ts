import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { IContractForReview, ReviewSettlementType } from './contract-interface';
import { isReviewableStatus } from './status-mapper';
import { nostrPubkeysMatch } from '$lib/utils/nostr-pubkey';

function deriveSettlementType(contract: NDKPaymentContract): ReviewSettlementType {
	const contextType = contract.tagValue('contextType');
	const hasAgreementSnapshot = contract.tagValue('agreementSnapshot') != null;

	if (contextType === 'service' || hasAgreementSnapshot) {
		const purchaseMode = contract.tagValue('purchaseMode');
		return purchaseMode === 'instant_buy' ? 'instant_buy_contract' : 'service_quote_contract';
	}
	return 'escrow';
}

/** Tasker/taskee addresses from `getEscrow` / payment contract (same mapping as on-chain parties). */
export type ChainParticipantWallets = {
	tasker: string;
	taskee: string;
};

/**
 * Adapts an NDKPaymentContract to the version-agnostic IContractForReview interface.
 *
 * @param contract  The raw NDK contract event whose `s` tag is static (set at publish time).
 * @param liveStatus  Escrow source-of-truth status (e.g. `ContractStatus[7]` → `"FundsReleased"`).
 *   When provided it replaces the stale `s` tag for `isReviewable()` and `status`.
 * @param chainWallets  Tasker/taskee RSK addresses from the last on-chain read (required for attestation wallets).
 */
export function adaptNDKContract(
	contract: NDKPaymentContract,
	liveStatus?: string,
	chainWallets?: ChainParticipantWallets | null
): IContractForReview {
	const tw = chainWallets?.tasker?.trim();
	const taw = chainWallets?.taskee?.trim();
	return {
		get contractId() {
			return contract.id ?? '';
		},

		get paymentId() {
			return contract.paymentId ?? '';
		},

		get txHash() {
			return contract.transactionHash;
		},

		get status() {
			return liveStatus ?? contract.status ?? '';
		},

		get clientPubkey() {
			return contract.taskerPubkey ?? '';
		},

		get freelancerPubkey() {
			return contract.taskeePubkey ?? '';
		},

		get settlementType() {
			return deriveSettlementType(contract);
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

		get taskTitle() {
			return (contract.taskTitle ?? '').trim();
		},

		get taskDescription() {
			return (contract.taskDescription ?? '').trim();
		},

		get taskerWalletAddress() {
			return tw || undefined;
		},

		get taskeeWalletAddress() {
			return taw || undefined;
		},

		get contractVersion() {
			// @deprecated - Use settlementType instead of version for contract differentiation
			return contract.version ?? '';
		},

		isReviewable() {
			return isReviewableStatus(liveStatus ?? contract.status);
		},

		getReviewableParty(currentUserPubkey: string) {
			const taskerPubkey = contract.taskerPubkey ?? '';
			const taskeePubkey = contract.taskeePubkey ?? '';

			// Use proper pubkey matching that handles npub/hex conversion
			if (nostrPubkeysMatch(currentUserPubkey, taskerPubkey)) return 'client';
			if (nostrPubkeysMatch(currentUserPubkey, taskeePubkey)) return 'freelancer';
			return null;
		}
	};
}

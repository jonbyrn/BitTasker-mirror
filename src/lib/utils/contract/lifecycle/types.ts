import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import type { ContractChain, SecurePaymentLegacy } from '$lib/utils/contract/types';
import type { PermittedActions } from '$lib/utils/contract/v2/permittedActions';

export type ContractLifecycleResult =
	| { ok: true; transactionHash: string }
	| { ok: false; errorKey: string };

/**
 * Narrow view of `PaymentContractRune` for lifecycle modules (avoids circular imports with the rune file).
 */
export type PaymentContractRuneLike = {
	contract: NDKPaymentContract;
	paymentId: string | undefined;
	version: string;
	isPending: boolean;
	blockchainData: SecurePaymentLegacy | null;
	readonly isTasker: boolean;
	contractAddress: string;
	parentEventId: string;
	taskerPubkey: string | undefined;
	taskTitle: string;
	readonly statusEventsByNewest: NDKContractStatus[];
};

export type PaymentContractLifecycle = {
	loadPaymentContractDetails: (
		rune: PaymentContractRuneLike,
		chain?: ContractChain
	) => Promise<SecurePaymentLegacy>;
	computePermittedActions: (rune: PaymentContractRuneLike) => PermittedActions;
	markTaskComplete: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
	/** When true, Nostr 31006 with `transactionHash` triggers wait-for-tx + chain reload. */
	shouldAwaitStatusTransaction: boolean;
};

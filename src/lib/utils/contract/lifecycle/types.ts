import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import type { NDKTask } from '$lib/nostr/events/task';
import type { Attachment } from '$lib/types/task';
import type {
	ContractChain,
	ContractDisplayStatus,
	SecurePaymentLegacy
} from '$lib/utils/contract/types';
import type { PermittedActions } from '$lib/utils/contract/v2/permittedActions';

export type CompleteTaskErrorCode =
	| 'timeout'
	| 'confirm_timeout'
	| 'signer_mismatch'
	| 'reverted'
	| 'failed';

export type ContractLifecycleResult =
	| { ok: true; transactionHash: string }
	| { ok: false; errorCode?: CompleteTaskErrorCode; transactionHash?: string };

/**
 * Narrow view of `PaymentContractRune` for lifecycle modules (avoids circular imports with the rune file).
 */
export type PaymentContractRuneLike = {
	contract: NDKPaymentContract;
	paymentId: string | undefined;
	version: string;
	isPending: boolean;
	isFailed: boolean;
	blockchainData: SecurePaymentLegacy | null;
	readonly isTasker: boolean;
	contractAddress: string;
	parentEventId: string;
	taskerPubkey: string | undefined;
	taskTitle: string;
	/** Kind 31000 replaceable; loaded by rune for accept + reconciliation. */
	task: NDKTask | null;
	readonly statusEventsByNewest: NDKContractStatus[];
	/**
	 * Completion evidence copied from Kind 31006 events that include a `completionAttachments` tag.
	 */
	readonly completionAttachments: Attachment[];
	/**
	 * Completion evidence text copied from Kind 31006 events that include a `completionText` tag.
	 */
	readonly completionText: string;
	/**
	 * Effective estimated start time — blockchain data is source of truth, Nostr tags are fallback.
	 */
	readonly effectiveEstimatedStartTime: number | undefined;
	/**
	 * Effective estimated completion time — blockchain data is source of truth, Nostr tags are fallback.
	 */
	readonly effectiveEstimatedCompletionTime: number | undefined;
};

export type PaymentContractLifecycle = {
	loadPaymentContractDetails: (
		rune: PaymentContractRuneLike,
		chain?: ContractChain
	) => Promise<SecurePaymentLegacy>;
	/** Display label — v1 may fuse chain + Kind 31006 (e.g. FundsReleased); v2 follows chain. */
	computeDisplayStatus: (rune: PaymentContractRuneLike) => ContractDisplayStatus;
	/** Terminal for subscriptions / permissions clock / reconciliation (version-specific). */
	isTerminalRuneState: (rune: PaymentContractRuneLike) => boolean;
	computePermittedActions: (rune: PaymentContractRuneLike) => PermittedActions;
	markTaskComplete: (
		rune: PaymentContractRuneLike,
		completionAttachments?: Attachment[],
		completionText?: string
	) => Promise<ContractLifecycleResult>;
	/** Tasker accepts completed work → `FundsReleased` on chain + status + push to taskee. */
	acceptTask: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
	/** Taskee refunds tasker → `Refunded` on chain + 31006 + push to tasker. */
	refundTasker: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
	/** Tasker or taskee cancels → `Cancelled` on chain + 31006 + push to counterparty. */
	cancelPaymentContract: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
	/** Tasker marks no-show → `NoShow` on chain + 31006 + push to taskee. */
	markNoShow: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
	/** Taskee marks work in progress after no-show → `WorkInProgress` + 31006 + push to tasker. */
	markWorkInProgress: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
	/** Tasker claims refund after no-show window → `FundsClaimed` + 31006 + push to taskee. */
	claimNoShowRefund: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
	/** Tasker disputes → `InDispute` / `InDisputeWorkInProgress` + 31006 + push to taskee. */
	disputeTask: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
	/** Propose dispute resolution (`taskeeAmount` wei). */
	proposeResolution: (
		rune: PaymentContractRuneLike,
		taskeeAmountWei: bigint
	) => Promise<ContractLifecycleResult>;
	/** Accept counterparty proposal → `DisputeResolved` + 31006 + push. */
	acceptProposal: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
	/** Resolve after timelock (completed or dispute) + 31006 + push. */
	resolveAfterTimelock: (rune: PaymentContractRuneLike) => Promise<ContractLifecycleResult>;
};

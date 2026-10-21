import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import { NDKContractStatus } from '$lib/nostr/events/contractStatus';
import type { Attachment } from '$lib/types/task';
import { createDebug } from '$lib/utils/debug';
import {
	getPaymentContractLifecycle,
	type ContractLifecycleResult,
	type PaymentContractLifecycle,
	type PaymentContractRuneLike
} from '$lib/utils/contract/lifecycle';
import {
	parsePaymentContractCreatedPaymentId,
	publishTaskCompletedForEscrow
} from '$lib/utils/contract/v2/creation';
import type { PermittedActions } from '$lib/utils/contract/v2/permittedActions';
import { getProvider } from '$lib/utils/contract';
import {
	type ContractDisplayStatus,
	ContractStatus,
	type SecurePaymentLegacy
} from '$lib/utils/contract/types';
import { ndk } from '$lib/nostr/ndk';
import { NDKUser } from '@nostr-dev-kit/ndk';
import { NDKBid, type NDKBid as NDKBidType } from '$lib/nostr/events/bid';
import type { NDKSubscription, NDKSubscriptionOptions, NDKFilter } from '@nostr-dev-kit/ndk';
import KINDS from '$lib/utils/constants/kinds';
import type { NDKTask } from '$lib/nostr/events/task';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
import {
	getPendingResolutionProposalFromStatusEvents,
	type PendingResolutionProposal
} from '$lib/utils/contract/resolutionProposalDisplay';
import { isBlockCanonical } from '$lib/utils/service-contract/finality';
import { mergeTimelineStatus } from '$lib/utils/contract/localContractFeed';
import { subscribeCompleteSettlement } from '$lib/utils/contract/v2/completeOutcome';
import { chainAllowsComplete } from '$lib/utils/contract/v2/completeTaskGuard';

const d = createDebug('runes:contractRune');

export type { PendingResolutionProposal };

/**
 * Recompute time-based `permittedActions` (e.g. `now >= estimatedStartTime`) without a full reload.
 * Stopped when chain is terminal or the card unsubscribes.
 */
const PERMISSIONS_CLOCK_MS = 15_000;

export type { ContractLifecycleResult };

export class PaymentContractRune implements PaymentContractRuneLike {
	/** Set in constructor; asserted because `$derived` fields reference it above TS init analysis. */
	contract!: NDKPaymentContract;
	task: NDKTask | null = null;
	paymentId: string | undefined;
	version: string;
	lifecycle: PaymentContractLifecycle;
	isPending = $state(false);
	/**
	 * First EOSE: relay backfill is done. We then reconcile once from the **newest** historical
	 * event (same rules as live). Later `onEvent` calls use the same path.
	 */
	statusHistoryReady = $state(false);
	blockchainData = $state<SecurePaymentLegacy | null>(null);
	/** Raw chain `state` from `getEscrow` / `getPaymentContract` (v1 may stay `Completed` after payout). */
	blockchainStatus = $derived<ContractStatus>(this.blockchainData?.state ?? ContractStatus.Funded);
	optimisticBlockchainStatus = $state<ContractStatus | null>(null);
	/** Newest first (`created_at` only). Truth for permissions remains `blockchainData`. */
	statusEventsByNewest = $derived.by(() =>
		[...this.statusEvents].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
	);
	/** Bumped on an interval + after chain reload so time-based display and permissions stay fresh. */
	private permissionsTimeSignal = $state(0);
	private permissionsClockId: ReturnType<typeof setInterval> | null = null;

	chainIsTerminal = $derived.by(() => this.lifecycle.isTerminalRuneState(this));
	displayStatus = $derived.by((): ContractDisplayStatus => {
		if (this.optimisticBlockchainStatus) {
			return this.optimisticBlockchainStatus;
		}
		// Re-run when the permissions clock ticks so Funded → In progress crosses estimated start.
		void this.permissionsTimeSignal;
		return this.lifecycle.computeDisplayStatus(this);
	});
	error = $state<string | null>(null);
	/** Set to true when the on-chain transaction is confirmed reverted (status === 0). */
	isFailed = $state(false);
	statusEvents = $state<NDKContractStatus[]>([]);
	/**
	 * Bumped whenever a status row is added so an open timeline re-renders
	 * even if the relay has not echoed the event yet.
	 */
	timelineRevision = $state(0);
	statusSub: NDKSubscription | null = null;
	private settlementUnsub: (() => void) | null = null;

	/**
	 * Completion evidence from status subscription only (newest `completeTask` + Completed 31006).
	 */
	completionAttachments = $state<Attachment[]>([]);

	/**
	 * Completion text from status subscription only (newest `completeTask` + Completed 31006).
	 */
	completionText = $state<string>('');

	/** Original bid event (Kind 30007) loaded via task.acceptedBid tag. Null until loaded or if unavailable. */
	originalBid = $state<NDKBidType | null>(null);

	/**
	 * Effective estimated start time — blockchain data is source of truth, Nostr tags are fallback.
	 * Consumers (drawer, card, completion) should use this instead of reading from contract tags directly.
	 */
	effectiveEstimatedStartTime = $derived.by(() => {
		return this.blockchainData?.estimatedStartTime ?? this.contract.estimatedStartTime ?? undefined;
	});

	/**
	 * Effective estimated completion time — blockchain data is source of truth, Nostr tags are fallback.
	 * Consumers (drawer, card, completion) should use this instead of reading from contract tags directly.
	 */
	effectiveEstimatedCompletionTime = $derived.by(() => {
		return (
			this.blockchainData?.estimatedCompletionTime ??
			this.contract.estimatedCompletionTime ??
			undefined
		);
	});

	/**
	 * Unix seconds when the taskee may submit work. Set only while the chain
	 * would allow completion except the start time has not arrived.
	 */
	submitWorkLockedUntil = $derived.by((): number | null => {
		if (this.isTasker || this.permittedActions.canCompleteTask) return null;
		const start = this.effectiveEstimatedStartTime;
		if (start == null) return null;
		const state = this.optimisticBlockchainStatus ?? this.blockchainData?.state;
		if (
			state !== ContractStatus.Funded &&
			state !== ContractStatus.NoShow &&
			state !== ContractStatus.WorkInProgress
		) {
			return null;
		}
		void this.permissionsTimeSignal;
		if (Math.floor(Date.now() / 1000) >= start) return null;
		return start;
	});

	contractAddress = $derived(this.contract.contractAddress?.trim() ?? '');
	parentEventId = $derived(this.contract.id ?? '');
	taskerPubkey = $derived(this.contract.taskerPubkey);
	taskTitle = $derived(this.contract.taskTitle ?? 'Task');

	/** Viewer is the Kind 30006 author (tasker); otherwise treated as taskee for permissions. */
	isTasker = $derived.by(() => {
		const me = this.contract.ndk?.activeUser?.pubkey;
		const tasker = this.contract.taskerPubkey;
		return !!(me && tasker && me === tasker);
	});

	/**
	 * Eligibility flags — delegated to version lifecycle.
	 * Touches `statusEventsByNewest` so Nostr history affects future dispute projection.
	 */
	permittedActions = $derived.by((): PermittedActions => {
		// Read deps so derived re-runs when Nostr history or permissions clock updates.
		const _statusEvents = this.statusEventsByNewest;
		const _permissionsTime = this.permissionsTimeSignal;
		return this.lifecycle.computePermittedActions(this);
	});

	/**
	 * Active latest `proposeResolution` from Kind 31006 history while the escrow is in dispute.
	 * Used to show splits before accepting or counter-proposing.
	 */
	pendingResolutionProposal = $derived.by((): PendingResolutionProposal | null => {
		const chainState = this.optimisticBlockchainStatus ?? this.blockchainData?.state;
		if (chainState === undefined || chainState === null) return null;
		if (
			chainState !== ContractStatus.InDispute &&
			chainState !== ContractStatus.InDisputeWorkInProgress
		) {
			return null;
		}
		return getPendingResolutionProposalFromStatusEvents(
			this.statusEvents,
			this.contract.taskerPubkey,
			this.contract.taskeePubkey
		);
	});

	constructor(contract: NDKPaymentContract) {
		this.contract = contract;
		this.paymentId = contract.paymentId || undefined;
		this.version = contract.version ?? 'v1';
		this.lifecycle = getPaymentContractLifecycle(this.version);
		this.isPending = !this.paymentId && !!this.contract.transactionHash;
	}

	/**
	 * Taskee marks complete (v2); v1 returns not allowed.
	 * Optional `attachments` and `completionText` are sent on the 31006 only; `completionAttachments`
	 * and `completionText` on this rune update when status events arrive from relays (including your own publish).
	 * TODO(gasless): prefer meta-tx when available (in v2 lifecycle).
	 */
	markTaskComplete(
		attachments?: Attachment[],
		completionText?: string
	): Promise<ContractLifecycleResult> {
		this.ensureSettlementListener();
		return this.lifecycle.markTaskComplete(this, attachments, completionText).then((res) => {
			if (res.ok) {
				this.recordLocalStatus({
					status: ContractStatus.Completed,
					transactionHash: res.transactionHash,
					completionText,
					attachments,
					pubkey: ndk.activeUser?.pubkey
				});
			}
			return res;
		});
	}

	/** Tasker accepts completed work (v2); v1 returns not allowed. */
	acceptTask(): Promise<ContractLifecycleResult> {
		return this.lifecycle.acceptTask(this).then((res) => {
			if (res.ok) {
				this.recordLocalStatus({
					status: ContractStatus.FundsReleased,
					transactionHash: res.transactionHash,
					pubkey: ndk.activeUser?.pubkey
				});
			}
			return res;
		});
	}

	/** Taskee refunds tasker (v2); v1 returns not allowed. */
	refundTasker(): Promise<ContractLifecycleResult> {
		return this.lifecycle.refundTasker(this);
	}

	/** Tasker or taskee cancels escrow (v2); v1 returns not allowed. */
	cancelPaymentContract(): Promise<ContractLifecycleResult> {
		return this.lifecycle.cancelPaymentContract(this);
	}

	/** Tasker marks taskee no-show (v2). */
	markNoShow(): Promise<ContractLifecycleResult> {
		return this.lifecycle.markNoShow(this);
	}

	/** Taskee marks work in progress after no-show (v2). */
	markWorkInProgress(): Promise<ContractLifecycleResult> {
		return this.lifecycle.markWorkInProgress(this);
	}

	/** Tasker claims refund after no-show response window (v2). */
	claimNoShowRefund(): Promise<ContractLifecycleResult> {
		return this.lifecycle.claimNoShowRefund(this);
	}

	/** Tasker raises a dispute (v2). */
	disputeTask(): Promise<ContractLifecycleResult> {
		return this.lifecycle.disputeTask(this);
	}

	/** Propose dispute resolution — `taskeeAmountWei` in contract base units (v2). */
	proposeResolution(taskeeAmountWei: bigint): Promise<ContractLifecycleResult> {
		return this.lifecycle.proposeResolution(this, taskeeAmountWei);
	}

	/** Accept the other party's resolution proposal (v2). */
	acceptProposal(): Promise<ContractLifecycleResult> {
		return this.lifecycle.acceptProposal(this);
	}

	/** Resolve after timelock (v2). */
	resolveAfterTimelock(): Promise<ContractLifecycleResult> {
		return this.lifecycle.resolveAfterTimelock(this);
	}

	async start() {
		this.ensureSettlementListener();
		d.log('start: sync requested', { paymentId: this.paymentId, version: this.version });
		await this.getOriginalTaskEvent();
		await this.getOriginalBidEvent();
		if (!this.paymentId && this.contract.transactionHash) {
			await this.resolvePaymentIdFromTxHash();
			// If the resolution failed with a transient error (not a revert), retry once.
			// This handles provider timeouts or RPC hiccups on first load.
			if (!this.paymentId && !this.isFailed && this.error) {
				d.warn('start: resolvePaymentIdFromTxHash failed, retrying in 3s', {
					error: this.error
				});
				this.error = null;
				await new Promise((r) => setTimeout(r, 3000));
				await this.resolvePaymentIdFromTxHash();
			}
		}

		if (!this.paymentId) {
			d.log('start: skipping onchain + subscription, paymentId not available yet');
			// No kind-31006 subscription; nothing to wait for from relay EOSE.
			this.statusHistoryReady = true;
			return;
		}

		if (!this.contract.contractAddress) {
			this.error = 'Contract address is missing';
			this.statusHistoryReady = true;
			this.syncPermissionsClock();
			return;
		}

		try {
			await this.reloadBlockchainData();
			d.log('start: payment contract data loaded', {
				paymentId: this.paymentId,
				blockchainData: $state.snapshot(this.blockchainData)
			});
		} catch (err) {
			d.warn('start: first blockchain load failed, retrying in 3s', {
				paymentId: this.paymentId,
				error: err instanceof Error ? err.message : String(err)
			});
			await new Promise((r) => setTimeout(r, 3000));
			try {
				await this.reloadBlockchainData();
				d.log('start: payment contract data loaded on retry', {
					paymentId: this.paymentId
				});
			} catch (retryErr) {
				const error = retryErr instanceof Error ? retryErr.message : String(retryErr);
				this.error = error;
				d.error('start: escrow sync failed after retry', { error });
			}
		}

		this.syncPermissionsClock();
		this.setupSubscription();
		this.statusSub?.start();
	}

	private async reloadBlockchainData(): Promise<void> {
		if (!this.paymentId || !this.contract.contractAddress) return;
		const data = await this.lifecycle.loadPaymentContractDetails(this);
		this.blockchainData = data;
		await this.maybeReconcileTaskWithChain();
		this.syncPermissionsClock();
	}

	/** Public retry: clears error, resolves paymentId if missing, reloads blockchain data, restarts subscription. */
	async retryLoadBlockchainData(): Promise<void> {
		this.error = null;

		// If paymentId is missing, try to resolve it from the transaction hash first.
		if (!this.paymentId && this.contract.transactionHash) {
			await this.resolvePaymentIdFromTxHash();
			// If the resolution failed with a transient error (not a revert), retry once.
			if (!this.paymentId && !this.isFailed && this.error) {
				d.warn('retryLoadBlockchainData: resolvePaymentIdFromTxHash failed, retrying', {
					error: this.error
				});
				this.error = null;
				await new Promise((r) => setTimeout(r, 3000));
				await this.resolvePaymentIdFromTxHash();
			}
		}

		try {
			await this.reloadBlockchainData();
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			this.error = error;
			d.error('retryLoadBlockchainData: failed', { error });
		}
		this.syncPermissionsClock();
		this.setupSubscription();
		this.statusSub?.start();
	}

	/** Start/stop wall-clock polling for permitted-actions windows (cancel windows, start time, timelocks, …). */
	private syncPermissionsClock(): void {
		if (this.lifecycle.isTerminalRuneState(this)) {
			this.stopPermissionsClock();
			return;
		}
		const pid = this.paymentId?.trim();
		const data = this.blockchainData;
		if (!data && !pid) {
			this.stopPermissionsClock();
			return;
		}
		if (this.permissionsClockId === null) {
			this.permissionsClockId = setInterval(() => {
				this.permissionsTimeSignal = Date.now();
			}, PERMISSIONS_CLOCK_MS);
		}
		this.permissionsTimeSignal = Date.now();
	}

	private stopPermissionsClock(): void {
		if (this.permissionsClockId !== null) {
			clearInterval(this.permissionsClockId);
			this.permissionsClockId = null;
		}
	}

	/**
	 * When the escrow is in a **terminal** effective state (version-specific) but the kind 31000
	 * task is still not `COMPLETED` (e.g. taskee refunded — taskee cannot publish the replaceable),
	 * the **tasker** republishes COMPLETED so listings match chain. Same idea after accept when Nostr lagged.
	 */
	private async maybeReconcileTaskWithChain(): Promise<void> {
		const data = this.blockchainData;
		if (!data || !this.task) return;
		if (!this.lifecycle.isTerminalRuneState(this)) return;
		if (this.task.status === TaskStatusEnum.COMPLETED) return;
		if (ndk.activeUser?.pubkey !== this.task.author?.pubkey) {
			d.log('maybeReconcileTaskWithChain: skip (not signed in as task author)');
			return;
		}
		try {
			await publishTaskCompletedForEscrow(this.task);
			d.log('maybeReconcileTaskWithChain: republished task COMPLETED', { chainState: data.state });
		} catch (e) {
			d.warn('maybeReconcileTaskWithChain: publish failed', e);
		}
	}

	/**
	 * Try to decode the revert reason from a reverted transaction.
	 * Replays the tx via provider.call() which throws with the revert data.
	 * Returns a human-readable error key like 'InvalidEstimatedTimes', or null if unable to decode.
	 */
	private async decodeRevertReason(
		provider: import('ethers').JsonRpcProvider,
		txHash: string
	): Promise<string | null> {
		try {
			const tx = await provider.getTransaction(txHash);
			if (!tx?.to || !tx.data) return null;
			// Replay the call — ethers will throw with the decoded revert reason
			await provider.call({
				to: tx.to,
				from: tx.from,
				data: tx.data,
				value: tx.value
			});
			return null; // should not reach here for reverted txs
		} catch (e: unknown) {
			// ethers v6 puts the decoded error name in the message
			const msg = e instanceof Error ? e.message : String(e);
			// Try to extract the error name (e.g., 'InvalidEstimatedTimes')
			const match = msg.match(/reverted with custom error '(\w+)\(/);
			if (match?.[1]) return match[1];
			// Try another pattern: 'execution reverted: ErrorName'
			const match2 = msg.match(/execution reverted: (\w+)/);
			if (match2?.[1]) return match2[1];
			d.warn('decodeRevertReason: could not parse', { msg: msg.slice(0, 200) });
			return null;
		}
	}

	private async resolvePaymentIdFromTxHash(): Promise<void> {
		const txHash = this.contract.transactionHash;
		if (!txHash) return;
		if (!this.contract.contractAddress) {
			this.error = 'Contract address is missing';
			return;
		}

		this.isPending = true;
		this.optimisticBlockchainStatus = ContractStatus.Funded;
		d.log('resolvePaymentIdFromTxHash: waiting tx confirmation', { txHash });

		const TIMEOUT_MS = 180000; // 3 minutes

		try {
			const provider = await getProvider('rsk');

			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(
					() =>
						reject(
							new Error(
								'Transaction confirmation timed out after 3 minutes. The blockchain may be experiencing delays. You can wait longer or check your transaction status on the explorer.'
							)
						),
					TIMEOUT_MS
				);
			});

			const receipt = await Promise.race([provider.waitForTransaction(txHash), timeoutPromise]);

			if (!receipt) {
				throw new Error('Transaction receipt not available');
			}

			if (receipt.status === 0) {
				this.isFailed = true;
				const revertReason = await this.decodeRevertReason(provider, txHash);
				throw new Error(revertReason ? 'tx_reverted:' + revertReason : 'tx_reverted');
			}

			const paymentId = parsePaymentContractCreatedPaymentId(
				receipt,
				this.contract.contractAddress
			).toString();
			this.paymentId = paymentId;
			this.contract.paymentId = paymentId;
			this.isPending = false;
			d.log('resolvePaymentIdFromTxHash: paymentId resolved', { txHash, paymentId });
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			this.error = error;
			this.isPending = false;
			d.error('resolvePaymentIdFromTxHash: failed', { txHash, error });
		} finally {
			this.optimisticBlockchainStatus = null;
		}
	}

	/** Live events: wait on the published hash, then refresh chain (not terminal). */
	private async awaitStatusTxThenReload(event: NDKContractStatus): Promise<void> {
		const txHash = event.transactionHash?.trim();
		if (!txHash) return;
		this.isPending = true;
		// Override derived rune for optimistic update while is pending confirmation
		if (event.status !== undefined) {
			this.optimisticBlockchainStatus = event.status;
		}
		d.log('awaitStatusTxThenReload', { txHash });

		try {
			const provider = await getProvider('rsk');
			const receipt = await provider.waitForTransaction(txHash);

			// Check if block is canonical (not reorged out) before trusting the confirmation
			if (receipt?.blockNumber) {
				const canonical = await isBlockCanonical(provider, receipt.blockNumber);
				if (!canonical) {
					d.warn('awaitStatusTxThenReload: block not yet canonical, waiting for reorg safety', {
						txHash,
						blockNumber: receipt.blockNumber
					});
					// Poll until canonical or timeout
					const deadline = Date.now() + 60_000; // 60s max wait for canonical
					while (Date.now() < deadline) {
						await new Promise((r) => setTimeout(r, 10_000));
						const newReceipt = await provider.getTransactionReceipt(txHash);
						if (newReceipt?.blockNumber) {
							const isCanonical = await isBlockCanonical(provider, newReceipt.blockNumber);
							if (isCanonical) {
								d.log('awaitStatusTxThenReload: block now canonical', { txHash });
								break;
							}
						}
					}
				}
			}

			await this.reloadBlockchainData();
			if (receipt?.status === 0) {
				d.warn('awaitStatusTxThenReload: tx reverted; reloaded chain anyway', { txHash });
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.error = msg;
			d.error('awaitStatusTxThenReload: failed', { txHash, err });
			try {
				await this.reloadBlockchainData();
			} catch (reloadErr) {
				d.error('awaitStatusTxThenReload: reload after error failed', reloadErr);
			}
		} finally {
			this.isPending = false;
			this.optimisticBlockchainStatus = null;
		}
	}

	private maybeAwaitStatusTxForEvent(ev: NDKContractStatus) {
		if (!this.paymentId || !this.blockchainData) return;
		if (this.chainIsTerminal) return;
		const h = ev.transactionHash?.trim();
		if (!h) return;
		void this.awaitStatusTxThenReload(ev);
	}

	private ensureSettlementListener(): void {
		if (this.settlementUnsub) return;
		this.settlementUnsub = subscribeCompleteSettlement((event) => {
			if (!this.paymentId || event.paymentId !== this.paymentId) return;
			if (event.phase !== 'late_confirmed' || event.status === undefined) return;
			this.recordLocalStatus({
				status: event.status,
				transactionHash: event.transactionHash,
				completionText: event.completionText,
				attachments: event.attachments,
				pubkey: event.pubkey
			});
		});
	}

	/**
	 * Show a lifecycle row immediately. Relay echoes of the same tx are deduped.
	 * Chain data reloads in the background; the optimistic status stays until that read agrees.
	 */
	private recordLocalStatus(input: {
		status: ContractStatus;
		transactionHash?: string;
		completionText?: string;
		attachments?: Attachment[];
		pubkey?: string;
	}): void {
		const ev = new NDKContractStatus(this.contract.ndk ?? ndk);
		ev.status = input.status;
		ev.created_at = Math.floor(Date.now() / 1000);
		if (input.transactionHash) ev.transactionHash = input.transactionHash;
		if (input.completionText) ev.completionText = input.completionText;
		if (input.attachments?.length) ev.completionAttachments = input.attachments;
		const pubkey = input.pubkey || ndk.activeUser?.pubkey;
		if (pubkey) ev.pubkey = pubkey;
		const parent = this.parentEventId;
		if (parent) ev.parentContractEventId = parent;
		this.optimisticBlockchainStatus = input.status;
		this.addStatusEvent(ev);
		void this.refreshChainAfterLocalStatus();
	}

	private addStatusEvent(ev: NDKContractStatus): void {
		const merged = mergeTimelineStatus(this.statusEvents, ev);
		this.applyCompletionAttachmentsFromEvent(ev);
		this.applyCompletionTextFromEvent(ev);
		if (!merged.added) return;
		this.statusEvents = merged.events;
		this.timelineRevision += 1;
	}

	private async refreshChainAfterLocalStatus(): Promise<void> {
		try {
			await this.reloadBlockchainData();
			const state = this.blockchainData?.state;
			if (state != null && !chainAllowsComplete(state)) {
				this.optimisticBlockchainStatus = null;
			}
		} catch (err) {
			d.warn('refreshChainAfterLocalStatus failed', err);
		}
	}

	/** When a 31006 carries `completionAttachments`, mirror them here (typically a single such event). */
	private applyCompletionAttachmentsFromEvent(ev: NDKContractStatus): void {
		const atts = ev.completionAttachments;
		if (!atts?.length) return;
		this.completionAttachments = atts.map((a) => ({ ...a }));
		d.log('completionAttachments from status event', {
			attachments: $state.snapshot(this.completionAttachments)
		});
	}

	/** When a 31006 carries `completionText`, mirror it here (typically a single such event). */
	private applyCompletionTextFromEvent(ev: NDKContractStatus): void {
		const text = ev.completionText;
		// Only skip if undefined - empty string is valid (means completion with media only, no text)
		if (text === undefined) return;
		this.completionText = text;
		d.log('completionText from status event', { completionText: this.completionText });
	}

	setupSubscription() {
		if (!this.paymentId) {
			d.log('setupSubscription: skipped (paymentId missing)');
			return;
		}
		this.statusSub?.stop();
		const filter: NDKFilter = { kinds: [KINDS.CONTRACT_STATUS], '#e': [this.contract.id] };
		const ops: NDKSubscriptionOptions = {
			closeOnEose: this.chainIsTerminal, // Close subscription after eose if chain state is already terminal
			wrap: true, // wrap the event in the NDKContractStatus class
			onEvent: (event) => {
				const ev = event as NDKContractStatus;
				this.addStatusEvent(ev);
				if (!this.statusHistoryReady) return;
				// only log new events that come in after the statusHistoryReady is true
				d.log('New status event for paymentId', { paymentId: this.paymentId, ev });
				this.maybeAwaitStatusTxForEvent(ev);
			},
			onEose: () => {
				d.log('setupSubscription: eose', {
					paymentId: this.paymentId,
					count: this.statusEvents.length
				});
				if (this.statusHistoryReady) return;
				this.statusHistoryReady = true;
				const newest = this.statusEventsByNewest[0];
				if (newest) {
					this.maybeAwaitStatusTxForEvent(newest);
				}
			}
		};
		this.statusSub = ndk.subscribe(filter, ops);
	}

	stopSubscription() {
		this.statusSub?.stop();
		this.statusSub = null;
		this.settlementUnsub?.();
		this.settlementUnsub = null;
		this.stopPermissionsClock();
	}

	async getOriginalTaskEvent() {
		const taskId = this.contract.taskId;
		if (!taskId) {
			this.task = null;
			return;
		}
		let filters: NDKFilter[];

		// If taskId looks like a 64-char hex string, use it in 'ids', otherwise use it in '#d'
		const isHex = typeof taskId === 'string' && /^[a-fA-F0-9]{64}$/.test(taskId);

		if (isHex) {
			filters = [{ kinds: [KINDS.TASK_CREATION], ids: [taskId], limit: 1 }];
		} else {
			filters = [{ kinds: [KINDS.TASK_CREATION], '#d': [taskId], limit: 1 }];
		}
		const ops: NDKSubscriptionOptions = {
			wrap: true
		};
		const events = await ndk.fetchEvents(filters, ops);
		const first = Array.from(events)[0] as NDKTask | undefined;
		if (!first) {
			d.warn('getOriginalTaskEvent: no task found', { paymentId: this.paymentId, taskId });
			this.task = null;
			return;
		}
		if (!first.ndk) {
			first.ndk = ndk;
		}
		d.log('getOriginalTaskEvent: loaded', { paymentId: this.paymentId, taskId });
		this.task = first;
	}

	/**
	 * Load the original bid event (Kind 30007) that was accepted for this contract.
	 * Requires `this.task` to be loaded first (reads `task.acceptedBid` tag).
	 *
	 * Uses manual decryption with the correct counterparty pubkey.
	 * NDKBid.from() decrypts with `bid.author` which fails when the current user IS
	 * the bid author (freelancer). The bid is encrypted between tasker and taskee,
	 * so we always decrypt using the OTHER party's pubkey.
	 */
	async getOriginalBidEvent(): Promise<void> {
		const bidId = this.task?.acceptedBid;
		if (!bidId) {
			d.log('getOriginalBidEvent: no acceptedBid tag on task', {
				paymentId: this.paymentId
			});
			return;
		}

		try {
			const filter: NDKFilter = { kinds: [KINDS.BIDS], ids: [bidId], limit: 1 };
			// Fetch raw events — we decrypt manually with the correct counterparty
			const events = await ndk.fetchEvents(filter);
			const raw = Array.from(events)[0];
			if (!raw) {
				d.warn('getOriginalBidEvent: bid not found on relays', {
					paymentId: this.paymentId,
					bidId
				});
				return;
			}

			const bid = new NDKBid(raw.ndk ?? ndk, raw);
			if (!bid.ndk) bid.ndk = ndk;
			// The bid author is always the taskee (freelancer).
			// Decrypt with the OTHER party's pubkey:
			// - If current user is tasker: other = bid.author (taskee)
			// - If current user is taskee: other = taskerPubkey
			const taskerPk = this.contract.taskerPubkey;
			const counterpartyPk = this.isTasker ? bid.author.pubkey : taskerPk;
			const counterparty = counterpartyPk ? new NDKUser({ pubkey: counterpartyPk }) : undefined;
			if (counterparty) {
				try {
					await bid.decrypt(counterparty);
				} catch (e) {
					d.warn('getOriginalBidEvent: decrypt with counterparty failed, trying bid.author', {
						paymentId: this.paymentId,
						error: e
					});
					// Fallback: try with bid.author (covers edge cases)
					try {
						await bid.decrypt(bid.author);
					} catch {
						d.warn('getOriginalBidEvent: all decrypt attempts failed', {
							paymentId: this.paymentId
						});
					}
				}
			}

			this.originalBid = bid;
			d.log('getOriginalBidEvent: loaded', {
				paymentId: this.paymentId,
				bidId,
				hasContent: !!bid.bidContent
			});
		} catch (e) {
			d.warn('getOriginalBidEvent: failed to fetch bid', {
				paymentId: this.paymentId,
				bidId,
				error: e
			});
		}
	}
}

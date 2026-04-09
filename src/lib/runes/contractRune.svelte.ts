import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
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
import type { NDKSubscription, NDKSubscriptionOptions, NDKFilter } from '@nostr-dev-kit/ndk';
import KINDS from '$lib/utils/constants/kinds';
import type { NDKTask } from '$lib/nostr/events/task';
import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

const d = createDebug('runes:contractRune');

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
	statusEvents = $state<NDKContractStatus[]>([]);
	statusSub: NDKSubscription | null = null;

	/**
	 * Completion evidence from status subscription only (newest `completeTask` + Completed 31006).
	 */
	completionAttachments = $state<Attachment[]>([]);

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

	constructor(contract: NDKPaymentContract) {
		this.contract = contract;
		this.paymentId = contract.paymentId || undefined;
		this.version = contract.version ?? 'v1';
		this.lifecycle = getPaymentContractLifecycle(this.version);
		this.isPending = !this.paymentId && !!this.contract.transactionHash;
	}

	/**
	 * Taskee marks complete (v2); v1 returns not allowed.
	 * Optional `attachments` are sent on the 31006 only; `completionAttachments` on this rune updates
	 * when status events arrive from relays (including your own publish).
	 * TODO(gasless): prefer meta-tx when available (in v2 lifecycle).
	 */
	markTaskComplete(attachments?: Attachment[]): Promise<ContractLifecycleResult> {
		return this.lifecycle.markTaskComplete(this, attachments);
	}

	/** Tasker accepts completed work (v2); v1 returns not allowed. */
	acceptTask(): Promise<ContractLifecycleResult> {
		return this.lifecycle.acceptTask(this);
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
		d.log('start: sync requested', { paymentId: this.paymentId, version: this.version });
		await this.getOriginalTaskEvent();
		if (!this.paymentId && this.contract.transactionHash) {
			await this.resolvePaymentIdFromTxHash();
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
			const error = err instanceof Error ? err.message : String(err);
			this.error = error;
			d.error('start: escrow sync failed', { error });
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

		try {
			const provider = await getProvider('rsk');
			const receipt = await provider.waitForTransaction(txHash);
			if (!receipt) {
				throw new Error('Transaction receipt not available');
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

	/** When a 31006 carries `completionAttachments`, mirror them here (typically a single such event). */
	private applyCompletionAttachmentsFromEvent(ev: NDKContractStatus): void {
		const atts = ev.completionAttachments;
		if (!atts?.length) return;
		this.completionAttachments = atts.map((a) => ({ ...a }));
		d.log('completionAttachments from status event', {
			attachments: $state.snapshot(this.completionAttachments)
		});
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
				this.statusEvents.push(ev);
				this.applyCompletionAttachmentsFromEvent(ev);
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
}

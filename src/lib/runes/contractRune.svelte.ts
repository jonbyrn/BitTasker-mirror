import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';
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
import { isTerminalPaymentState } from '$lib/utils/contract/v2/permittedActions';
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
	blockchainStatus = $derived<ContractStatus>(this.blockchainData?.state ?? ContractStatus.Funded);
	/** Newest first (`created_at` only). Truth for permissions remains `blockchainData`. */
	statusEventsByNewest = $derived.by(() =>
		[...this.statusEvents].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
	);
	chainIsTerminal = $derived.by(() => {
		const data = this.blockchainData;
		if (!data) return false;
		return isTerminalPaymentState(data.state);
	});
	displayStatus = $derived<ContractDisplayStatus>(this.blockchainStatus);
	error = $state<string | null>(null);
	statusEvents = $state<NDKContractStatus[]>([]);
	statusSub: NDKSubscription | null = null;

	/** Bumped on an interval + after chain reload so `permissionsNowSeconds()` is effectively reactive. */
	private permissionsTimeSignal = $state(0);
	private permissionsClockId: ReturnType<typeof setInterval> | null = null;

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
	 * TODO(gasless): prefer meta-tx when available (in v2 lifecycle).
	 */
	markTaskComplete(): Promise<ContractLifecycleResult> {
		return this.lifecycle.markTaskComplete(this);
	}

	/** Tasker accepts completed work (v2); v1 returns not allowed. */
	acceptTask(): Promise<ContractLifecycleResult> {
		return this.lifecycle.acceptTask(this);
	}

	/** Taskee refunds tasker (v2); v1 returns not allowed. */
	refundTasker(): Promise<ContractLifecycleResult> {
		return this.lifecycle.refundTasker(this);
	}

	async start() {
		d.log('start: sync requested', { paymentId: this.paymentId, version: this.version });
		await this.getOriginalTaskEvent();
		if (!this.paymentId && this.contract.transactionHash) {
			await this.resolvePaymentIdFromTxHash();
		}

		if (!this.paymentId) {
			d.log('start: skipping onchain + subscription, paymentId not available yet');
			return;
		}

		if (!this.contract.contractAddress) {
			this.error = 'Contract address is missing';
			return;
		}

		try {
			await this.reloadBlockchainData();
			d.log('start: payment contract data loaded', {
				paymentId: this.paymentId,
				blockchainData: this.blockchainData
			});
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			this.error = error;
			d.error('start: escrow sync failed', { error });
		}

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
		const data = this.blockchainData;
		if (!data || isTerminalPaymentState(data.state)) {
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
	 * When the escrow is in a **terminal** chain state (`isTerminalPaymentState`) but the kind 31000
	 * task is still not `COMPLETED` (e.g. taskee refunded — taskee cannot publish the replaceable),
	 * the **tasker** republishes COMPLETED so listings match chain. Same idea after accept when Nostr lagged.
	 */
	private async maybeReconcileTaskWithChain(): Promise<void> {
		const data = this.blockchainData;
		if (!data || !this.task) return;
		if (!isTerminalPaymentState(data.state)) return;
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
		}
	}

	/** Live events: wait on the published hash, then refresh chain (not terminal). */
	private async awaitStatusTxThenReload(event: NDKContractStatus): Promise<void> {
		const txHash = event.transactionHash?.trim();
		if (!txHash) return;
		this.isPending = true;
		if (event.status !== undefined) {
			this.blockchainStatus = event.status;
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
		}
	}

	private maybeAwaitStatusTxForEvent(ev: NDKContractStatus) {
		if (!this.lifecycle.shouldAwaitStatusTransaction) return;
		if (!this.paymentId || !this.blockchainData) return;
		if (this.chainIsTerminal) return;
		const h = ev.transactionHash?.trim();
		if (!h) return;
		void this.awaitStatusTxThenReload(ev);
	}

	setupSubscription() {
		if (!this.paymentId) {
			d.log('setupSubscription: skipped (paymentId missing)');
			return;
		}
		this.statusSub?.stop();
		const filter: NDKFilter = { kinds: [KINDS.CONTRACT_STATUS], '#r': [this.paymentId] };
		const ops: NDKSubscriptionOptions = {
			closeOnEose: false, // keep subscrioption open after eose
			wrap: true, // wrap the event in the NDKContractStatus class
			onEvent: (event) => {
				this.statusEvents.push(event as NDKContractStatus);
				if (!this.statusHistoryReady) return;
				this.maybeAwaitStatusTxForEvent(event as NDKContractStatus);
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
		const filter: NDKFilter = { kinds: [KINDS.TASK_CREATION], '#d': [taskId], limit: 1 };
		const ops: NDKSubscriptionOptions = {
			wrap: true
		};
		const events = await ndk.fetchEvents(filter, ops);
		const first = Array.from(events)[0] as NDKTask | undefined;
		if (!first) {
			d.warn('getOriginalTaskEvent: no task replaceable found', { taskId });
			this.task = null;
			return;
		}
		if (!first.ndk) {
			first.ndk = ndk;
		}
		d.log('getOriginalTaskEvent: loaded', { taskId });
		this.task = first;
	}
}

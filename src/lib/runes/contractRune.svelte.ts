import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import { createDebug } from '$lib/utils/debug';
import { loadPaymentContractDetails } from '$lib/utils/contract/v1';
import { loadPaymentContractDetailsV2 } from '$lib/utils/contract/v2';
import { isTerminalPaymentState } from '$lib/utils/contract/v2/permittedActions';
import { getProvider } from '$lib/utils/contract';
import { parsePaymentContractCreatedPaymentId } from '$lib/utils/contract/v2/creation';
import {
	type ContractDisplayStatus,
	ContractStatus,
	type SecurePaymentLegacy
} from '$lib/utils/contract/types';
import { ndk } from '$lib/nostr/ndk';
import type { NDKSubscription, NDKSubscriptionOptions, NDKFilter } from '@nostr-dev-kit/ndk';
import KINDS from '$lib/utils/constants/kinds';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';

const d = createDebug('runes:contractRune');

export class PaymentContractRune {
	contract: NDKPaymentContract;
	isTasker: boolean;
	paymentId: string | undefined;
	version: string;
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

	constructor(contract: NDKPaymentContract) {
		this.contract = contract;
		this.isTasker = contract.ndk?.activeUser?.npub === contract.taskerPubkey;
		this.paymentId = contract.paymentId || undefined;
		this.version = contract.version ?? 'v1';
		this.isPending = !this.paymentId && !!this.contract.transactionHash;
	}

	async start() {
		d.log('start: sync requested', { paymentId: this.paymentId, version: this.version });

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
		const loadContractDetails =
			this.version === 'v2' ? loadPaymentContractDetailsV2 : loadPaymentContractDetails;
		const data = await loadContractDetails(this.paymentId, this.contract.contractAddress, 'rsk');
		this.blockchainData = data;
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

	/** v2 live events: wait on the published hash, then refresh chain (not terminal). */
	private async awaitStatusTxThenReload(txHash: string): Promise<void> {
		this.isPending = true;
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

	/** Shared guards for v2 status tx wait + chain reload (live or first EOSE newest row). */
	private maybeAwaitStatusTxForEvent(ev: NDKContractStatus) {
		if (this.version !== 'v2') return;
		if (!this.paymentId || !this.blockchainData) return;
		if (this.chainIsTerminal) return;
		const h = ev.transactionHash?.trim();
		if (!h) return;
		void this.awaitStatusTxThenReload(h);
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
				// only await status events after initial load of all events
				this.maybeAwaitStatusTxForEvent(event as NDKContractStatus);
			},
			onEose: () => {
				d.log('setupSubscription: eose', {
					paymentId: this.paymentId,
					count: this.statusEvents.length
				});
				if (this.statusHistoryReady) return;
				// check status of latest event after first load
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
	}
}

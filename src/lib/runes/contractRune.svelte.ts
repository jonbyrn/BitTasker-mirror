import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import { createDebug } from '$lib/utils/debug';
import { loadPaymentContractDetails } from '$lib/utils/contract/v1';
import { loadPaymentContractDetailsV2 } from '$lib/utils/contract/v2';
import { walletManager, getProvider } from '$lib/stores/wallet.store';
import { parsePaymentContractCreatedPaymentId } from '$lib/utils/contract/v2/creation';
import {
	type ContractDisplayStatus,
	ContractStatus,
	type SecurePaymentLegacy
} from '$lib/utils/contract/types';
import { ndk } from '$lib/nostr/ndk';
import type {
	NDKEvent,
	NDKSubscription,
	NDKSubscriptionOptions,
	NDKFilter
} from '@nostr-dev-kit/ndk';
import KINDS from '$lib/utils/constants/kinds';
import type { NDKContractStatus } from '$lib/nostr/events/contractStatus';

const d = createDebug('runes:contractRune');

export class PaymentContractRune {
	contract: NDKPaymentContract;
	isTasker: boolean;
	paymentId: string | undefined;
	version: string;
	isPending = $state(false);
	blockchainData = $state<SecurePaymentLegacy | null>(null);
	blockchainStatus = $derived<ContractStatus>(this.blockchainData?.state ?? ContractStatus.Funded);
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

		// Setup + start subscription only when paymentId exists
		this.setupSubscription();
		this.statusSub?.start();

		if (!this.paymentId) {
			d.log('start: skipping onchain data, paymentId not available yet');
			return;
		}

		// Get blockchain data
		try {
			if (!this.contract.contractAddress) {
				throw new Error('Contract address is missing');
			}
			const loadContractDetails =
				this.version === 'v2' ? loadPaymentContractDetailsV2 : loadPaymentContractDetails;
			const paymentContractData = await loadContractDetails(
				this.paymentId,
				this.contract.contractAddress,
				'rsk'
			);
			this.blockchainData = paymentContractData;
			d.log('start: payment contract data loaded', {
				paymentId: this.paymentId,
				paymentContractData
			});
		} catch (err) {
			const error = err instanceof Error ? err.message : String(err);
			this.error = error;
			d.error('start: escrow sync failed', { error });
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
			let provider = getProvider('rsk');
			if (!provider) {
				await walletManager.initialize();
				provider = getProvider('rsk');
			}
			if (!provider) {
				throw new Error('RSK provider not available');
			}

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

	setupSubscription() {
		if (!this.paymentId) {
			d.log('setupSubscription: skipped (paymentId missing)');
			return;
		}
		this.statusSub?.stop();
		const filter: NDKFilter = { kinds: [KINDS.CONTRACT_STATUS], '#r': [this.paymentId] };
		const ops: NDKSubscriptionOptions = {
			closeOnEose: false,
			onEvent: (event: NDKEvent) => {
				this.statusEvents.push(event as NDKContractStatus);
			},
			wrap: true,
			onEose: () => {
				// I want to log the contract and the list of status events for this contract and the paymentId
				d.log('setupSubscription: eose received', {
					paymentId: this.paymentId,
					contract: this.contract,
					statusEvents: $state.snapshot(this.statusEvents)
				});
			}
		};
		this.statusSub = ndk.subscribe(filter, ops);
	}

	stopSubscription() {
		this.statusSub?.stop();
		this.statusSub = null;
	}
}

import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import { createDebug } from '$lib/utils/debug';
import { loadPaymentContractDetails } from '$lib/utils/contract/v1';
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

const d = createDebug('runes:contractRune');

export class PaymentContractRune {
	contract: NDKPaymentContract;
	isTasker: boolean;
	paymentId: string | undefined;
	version: string;
	blockchainData = $state<SecurePaymentLegacy | null>(null);
	blockchainStatus = $derived<ContractStatus>(this.blockchainData?.state ?? ContractStatus.Funded);
	displayStatus = $derived<ContractDisplayStatus>(this.blockchainStatus);
	error = $state<string | null>(null);
	statusEvents = $state<NDKEvent[]>([]);
	statusSub: NDKSubscription | null = null;

	constructor(contract: NDKPaymentContract) {
		this.contract = contract;
		this.isTasker = contract.ndk?.activeUser?.npub === contract.taskerPubkey;
		this.paymentId = contract.paymentId;
		this.version = contract.version ?? 'v1';

		// Setup subscription for status events
		this.setupSubscription();
	}

	async start() {
		d.log('start: sync requested', { paymentId: this.paymentId, version: this.version });

		// Start subscription
		this.statusSub?.start();

		// Get blockchain data
		try {
			const paymentContractData = await loadPaymentContractDetails(
				this.paymentId!,
				this.contract.contractAddress!,
				'rsk'
			);
			this.blockchainData = paymentContractData;
			d.log('start: payment contract data loaded', { paymentContractData });
		} catch (err: unknown) {
			d.error('start: escrow sync failed', { error: err.message });
		}
	}

	setupSubscription() {
		const filter: NDKFilter = { kinds: [KINDS.CONTRACT_STATUS], '#r': [this.paymentId!] };
		const ops: NDKSubscriptionOptions = {
			closeOnEose: false,
			onEvent: (event: NDKEvent) => {
				this.statusEvents.push(event);
				d.log('#r', event.tagValue('r'));
			}
		};
		this.statusSub = ndk.subscribe(filter, ops);
	}
}

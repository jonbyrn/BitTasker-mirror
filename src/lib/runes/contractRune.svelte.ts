import type { NDKPaymentContract } from '$lib/nostr/events/contract';
import { createDebug } from '$lib/utils/debug';
import { loadPaymentContractDetails } from '$lib/utils/contract/v1';
import {
	type ContractDisplayStatus,
	ContractStatus,
	type SecurePaymentLegacy
} from '$lib/utils/contract/types';

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

	constructor(contract: NDKPaymentContract) {
		this.contract = contract;
		this.isTasker = contract.ndk?.activeUser?.npub === contract.taskerPubkey;
		this.paymentId = contract.paymentId;
		this.version = contract.version ?? 'v1';
	}

	async start() {
		d.log('start: sync requested', { paymentId: this.paymentId, version: this.version });

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
}

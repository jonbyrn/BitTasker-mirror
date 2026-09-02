/**
 * @deprecated Book Now Contract Recovery
 *
 * In v2, recovery is NOT a separate concern. The pattern is:
 * - NDK events are persisted on relays
 * - PaymentContractRune subscribes to events and shows current state
 * - If a transaction succeeded but Nostr event failed, afterConfirmed() handles republishing
 *
 * This file exists for backward compatibility during migration.
 * Once all service UIs use the v2 pattern, this can be removed.
 */

import { ethers } from 'ethers';
import type {
	ServiceContractAgreementSnapshot,
	ServiceContractPricingSnapshot
} from '$lib/types/contract';
import { ndk } from '$lib/nostr/ndk';
import KINDS from '$lib/utils/constants/kinds';
import { initContract } from '$lib/utils/contract';
import { publishServiceContractEvent } from '$lib/utils/contract/v2/service-creation';
import { getSecurePaymentContractAddress } from '$lib/utils/contract/v2/contractAddress';
import { parsePaymentContractCreatedPaymentId } from '$lib/utils/contract/v2/creation';
import abi from '$lib/utils/contract/v2/abi.json';

export interface RecoverBookNowContractInput {
	transactionHash: string;
	freelancerPubkey: string;
	clientRskAddress?: string;
	amountRbtc: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	serviceId: string;
	serviceAddress: string;
	serviceTitle: string;
	serviceDescription?: string;
	contextVersionRef: string;
	instantOrderId: string;
	selectedTierId?: string;
	pricingSnapshot: ServiceContractPricingSnapshot;
	agreementSnapshot?: ServiceContractAgreementSnapshot;
	escrowId?: string;
}

export type RecoverBookNowContractResult =
	| {
			status: 'contract_ready';
			escrowId: string;
			transactionHash: string;
	  }
	| {
			status: 'funding_pending' | 'contract_sync_pending' | 'failed';
			transactionHash: string;
			escrowId?: string;
			error?: string;
	  };

function normalizeTransactionHash(transactionHash: string): string {
	return transactionHash.trim().toLowerCase();
}

async function loadContractIfAvailable(paymentId: string): Promise<boolean> {
	try {
		const events = await ndk.fetchEvents({ kinds: [KINDS.CONTRACT], '#d': [paymentId], limit: 1 }, { closeOnEose: true });
		return events.size > 0;
	} catch {
		return false;
	}
}

function extractPaymentIdFromReceipt(
	receipt: ethers.TransactionReceipt | null,
	contractAddress: string
): string | null {
	if (!receipt) {
		return null;
	}

	const paymentId = parsePaymentContractCreatedPaymentId(receipt, contractAddress);
	return paymentId ? String(paymentId) : null;
}

/**
 * @deprecated Use the v2 pattern instead - let afterConfirmed() handle republishing
 */
export async function recoverBookNowContract(
	input: RecoverBookNowContractInput
): Promise<RecoverBookNowContractResult> {
	const transactionHash = normalizeTransactionHash(input.transactionHash);
	if (!transactionHash) {
		return {
			status: 'failed',
			transactionHash,
			error: 'Transaction hash is required to recover the Book Now contract.'
		};
	}

	try {
		if (input.escrowId && (await loadContractIfAvailable(input.escrowId))) {
			return {
				status: 'contract_ready',
				escrowId: input.escrowId,
				transactionHash
			};
		}

		const contractAddress = getSecurePaymentContractAddress();
		const { provider } = await initContract(
			contractAddress,
			'rsk',
			abi as ethers.InterfaceAbi
		);

		const receipt = await provider.getTransactionReceipt(transactionHash);
		if (!receipt) {
			return {
				status: 'funding_pending',
				transactionHash
			};
		}

		if (receipt.status !== 1) {
			return {
				status: 'failed',
				transactionHash,
				error: 'The Book Now funding transaction did not complete successfully.'
			};
		}

		const paymentId = extractPaymentIdFromReceipt(receipt, contractAddress) ?? input.escrowId ?? undefined;
		if (!paymentId) {
			return {
				status: 'contract_sync_pending',
				transactionHash
			};
		}

		if (await loadContractIfAvailable(paymentId)) {
			return {
				status: 'contract_ready',
				escrowId: paymentId,
				transactionHash
			};
		}

		const publishResult = await publishServiceContractEvent({
			paymentId,
			transactionHash,
			freelancerPubkey: input.freelancerPubkey,
			clientRskAddress: input.clientRskAddress,
			amount: input.amountRbtc,
			estimatedStartTime: input.estimatedStartTime,
			estimatedCompletionTime: input.estimatedCompletionTime,
			serviceId: input.serviceId,
			serviceAddress: input.serviceAddress,
			serviceTitle: input.serviceTitle,
			serviceDescription: input.serviceDescription,
			contextVersionRef: input.contextVersionRef,
			purchaseMode: 'instant_buy',
			instantOrderId: input.instantOrderId,
			selectedTierId: input.selectedTierId,
			pricingSnapshot: input.pricingSnapshot,
			agreementSnapshot: input.agreementSnapshot
		});

		if (!publishResult.success) {
			console.warn('[recoverBookNowContract] publish failed:', publishResult.error);
		}

		if ((await ndk.fetchEvents({ kinds: [KINDS.CONTRACT], '#d': [paymentId], limit: 1 }, { closeOnEose: true })).size > 0) {
			return {
				status: 'contract_ready',
				escrowId: paymentId,
				transactionHash
			};
		}

		return {
			status: 'contract_sync_pending',
			transactionHash,
			escrowId: paymentId
		};
	} catch (error) {
		return {
			status: 'failed',
			transactionHash,
			error: error instanceof Error ? error.message : 'Unable to recover the Book Now contract.'
		};
	}
}


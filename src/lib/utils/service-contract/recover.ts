/**
 * Book Now Contract Recovery
 *
 * This module handles recovery for instant-buy (Book Now) service contracts when the browser
 * was closed during transaction or the Nostr publish failed. Updated to use v2/NDK patterns.
 *
 * For reactive UI patterns, prefer using:
 * - PaymentContractRune automatically handles pending state and transaction recovery
 * - NDK subscriptions sync status from relays, providing built-in "recovery"
 *
 * See docs/service-escrow-version-abstraction.md for migration details.
 */

import { ethers } from 'ethers';
import type {
	ServiceContractAgreementSnapshot,
	ServiceContractPricingSnapshot
} from '$lib/types/contract';
import { contractStore } from '$lib/stores/contract.store';
import { ensureContractReady } from '$lib/utils/contract/v2/utils';
import { publishServiceContractEvent } from '$lib/utils/contract/v2/service-creation';
import { getSecurePaymentContractAddress } from '$lib/utils/contract/v2/contractAddress';
import { parsePaymentContractCreatedPaymentId } from '$lib/utils/contract/v2/creation';

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
		const loaded = await contractStore.loadContractByEscrowId(paymentId);
		return Boolean(loaded);
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

		const contractReady = await ensureContractReady(false);
		if (!contractReady.ok) {
			return {
				status: 'failed',
				transactionHash,
				error: contractReady.error
			};
		}

		const { provider } = contractReady.result;
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

		const contractAddress = getSecurePaymentContractAddress();
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

		if (await contractStore.loadContractByEscrowId(paymentId)) {
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

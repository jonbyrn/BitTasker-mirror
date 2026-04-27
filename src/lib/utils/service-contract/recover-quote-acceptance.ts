/**
 * @deprecated Service Quote Acceptance Recovery
 *
 * In v2, recovery is NOT a separate concern. The pattern is:
 * - NDK events are persisted on relays
 * - PaymentContractRune subscribes to events and shows current state
 * - If a transaction succeeded but Nostr event failed, afterConfirmed() handles republishing
 *
 * This file exists for backward compatibility during migration.
 * Once all service UIs use the v2 pattern, this can be removed.
 */

import { browser, dev } from '$app/environment';
import { ethers } from 'ethers';
import type {
	ServiceContractAgreementSnapshot,
	ServiceContractPricingSnapshot
} from '$lib/types/contract';
import { contractStore } from '$lib/stores/contract.store';
import { initContract } from '$lib/utils/contract';
import { publishServiceContractEvent } from '$lib/utils/contract/v2/service-creation';
import { getSecurePaymentContractAddress } from '$lib/utils/contract/v2/contractAddress';
import { parsePaymentContractCreatedPaymentId } from '$lib/utils/contract/v2/creation';
import abi from '$lib/utils/contract/v2/abi.json';

export interface RecoverServiceQuoteAcceptanceInput {
	transactionHash: string;
	freelancerPubkey: string;
	clientRskAddress?: string;
	amountRbtc?: string;
	estimatedStartTime: number;
	estimatedCompletionTime: number;
	serviceId: string;
	serviceAddress: string;
	serviceTitle: string;
	serviceDescription?: string;
	contextVersionRef: string;
	quoteRequestId: string;
	proposalId: string;
	proposalEventId: string;
	selectedTierId?: string;
	pricingSnapshot: ServiceContractPricingSnapshot;
	agreementSnapshot?: ServiceContractAgreementSnapshot;
	escrowId?: string;
}

export type RecoverServiceQuoteAcceptanceResult =
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

function logQuoteAcceptanceRecovery(event: string, details: Record<string, unknown>): void {
	if (!browser || !dev) {
		return;
	}

	console.info('[serviceQuoteRecovery]', event, details);
}

function normalizeTransactionHash(transactionHash: string): string {
	return transactionHash.trim().toLowerCase();
}

async function loadContractIfAvailable(paymentId: string): Promise<boolean> {
	try {
		const loaded = await contractStore.loadContractByEscrowId(paymentId);
		logQuoteAcceptanceRecovery('load-contract-if-available', {
			paymentId,
			loaded
		});
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

async function loadPaymentContractChainDetails(
	contract: ethers.Contract,
	paymentId: string
): Promise<{ amountRbtc?: string; clientRskAddress?: string }> {
	try {
		if (typeof contract.getPayment !== 'function') {
			return {};
		}

		const paymentData = await contract.getPayment(BigInt(paymentId));
		return {
			amountRbtc:
				typeof paymentData?.amount === 'bigint' ? ethers.formatEther(paymentData.amount) : undefined,
			clientRskAddress:
				typeof paymentData?.tasker === 'string' && paymentData.tasker.trim().length > 0
					? paymentData.tasker.toLowerCase()
					: undefined
		};
	} catch {
		return {};
	}
}

/**
 * @deprecated Use the v2 pattern instead - let afterConfirmed() handle republishing
 */
export async function recoverServiceQuoteAcceptanceContract(
	input: RecoverServiceQuoteAcceptanceInput
): Promise<RecoverServiceQuoteAcceptanceResult> {
	const transactionHash = normalizeTransactionHash(input.transactionHash);
	logQuoteAcceptanceRecovery('recover-start', {
		transactionHash,
		quoteRequestId: input.quoteRequestId,
		proposalId: input.proposalId,
		escrowId: input.escrowId ?? null,
		hasAmountRbtc: Boolean(input.amountRbtc)
	});
	if (!transactionHash) {
		return {
			status: 'failed',
			transactionHash,
			error: 'Transaction hash is required to recover the service quote acceptance.'
		};
	}

	try {
		if (input.escrowId && (await loadContractIfAvailable(input.escrowId))) {
			logQuoteAcceptanceRecovery('recover-hit-existing-contract', {
				transactionHash,
				escrowId: input.escrowId
			});
			return {
				status: 'contract_ready',
				escrowId: input.escrowId,
				transactionHash
			};
		}

		const contractAddress = getSecurePaymentContractAddress();
		const { contract, provider } = await initContract(
			contractAddress,
			'rsk',
			abi as ethers.InterfaceAbi
		);

		const receipt = await provider.getTransactionReceipt(transactionHash);
		logQuoteAcceptanceRecovery('recover-receipt-loaded', {
			transactionHash,
			hasReceipt: Boolean(receipt),
			receiptStatus: receipt?.status ?? null,
			logCount: receipt?.logs?.length ?? 0
		});
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
				error: 'The service quote funding transaction did not complete successfully.'
			};
		}

		const paymentId = extractPaymentIdFromReceipt(receipt, contractAddress) ?? input.escrowId ?? undefined;
		logQuoteAcceptanceRecovery('recover-payment-id', {
			transactionHash,
			paymentId: paymentId ?? null,
			fallbackEscrowId: input.escrowId ?? null
		});
		if (!paymentId) {
			return {
				status: 'contract_sync_pending',
				transactionHash
			};
		}

		if (await loadContractIfAvailable(paymentId)) {
			logQuoteAcceptanceRecovery('recover-contract-ready-after-load', {
				transactionHash,
				paymentId
			});
			return {
				status: 'contract_ready',
				escrowId: paymentId,
				transactionHash
			};
		}

		let amountRbtc = input.amountRbtc;
		let clientRskAddress = input.clientRskAddress;
		if (!amountRbtc || !clientRskAddress) {
			try {
				const chainDetails = await loadPaymentContractChainDetails(contract, paymentId);
				amountRbtc ??= chainDetails.amountRbtc;
				clientRskAddress ??= chainDetails.clientRskAddress;
				logQuoteAcceptanceRecovery('recover-chain-details', {
					transactionHash,
					paymentId,
					amountRbtc: amountRbtc ?? null,
					clientRskAddress: clientRskAddress ?? null
				});
			} catch (error) {
				logQuoteAcceptanceRecovery('recover-chain-details-failed', {
					transactionHash,
					paymentId,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		if (!amountRbtc) {
			logQuoteAcceptanceRecovery('recover-awaiting-contract-hydration', {
				transactionHash,
				paymentId,
				reason: 'missing_amount_rbtc_after_chain_lookup'
			});
			return {
				status: 'contract_sync_pending',
				transactionHash,
				escrowId: paymentId
			};
		}

		const publishResult = await publishServiceContractEvent({
			paymentId,
			transactionHash,
			freelancerPubkey: input.freelancerPubkey,
			clientRskAddress,
			amount: amountRbtc,
			estimatedStartTime: input.estimatedStartTime,
			estimatedCompletionTime: input.estimatedCompletionTime,
			serviceId: input.serviceId,
			serviceAddress: input.serviceAddress,
			serviceTitle: input.serviceTitle,
			serviceDescription: input.serviceDescription,
			contextVersionRef: input.contextVersionRef,
			purchaseMode: 'quote',
			quoteRequestId: input.quoteRequestId,
			proposalId: input.proposalId,
			proposalEventId: input.proposalEventId,
			selectedTierId: input.selectedTierId,
			pricingSnapshot: input.pricingSnapshot,
			agreementSnapshot: input.agreementSnapshot
		});

		if (!publishResult.success) {
			logQuoteAcceptanceRecovery('recover-publish-failed', {
				transactionHash,
				paymentId,
				error: publishResult.error
			});
		} else {
			logQuoteAcceptanceRecovery('recover-published-contract-event', {
				transactionHash,
				paymentId
			});
		}

		if (await contractStore.loadContractByEscrowId(paymentId)) {
			logQuoteAcceptanceRecovery('recover-contract-ready-after-publish', {
				transactionHash,
				paymentId
			});
			return {
				status: 'contract_ready',
				escrowId: paymentId,
				transactionHash
			};
		}

		logQuoteAcceptanceRecovery('recover-still-syncing-after-publish', {
			transactionHash,
			paymentId
		});
		return {
			status: 'contract_sync_pending',
			transactionHash,
			escrowId: paymentId
		};
	} catch (error) {
		logQuoteAcceptanceRecovery('recover-failed', {
			transactionHash,
			error: error instanceof Error ? error.message : String(error)
		});
		return {
			status: 'failed',
			transactionHash,
			error:
				error instanceof Error
					? error.message
					: 'Unable to recover the service quote acceptance contract.'
		};
	}
}

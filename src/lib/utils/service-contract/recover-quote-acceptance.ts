import { browser, dev } from '$app/environment';
import { ethers } from 'ethers';
import type {
	ServiceContractAgreementSnapshot,
	ServiceContractPricingSnapshot
} from '$lib/types/contract';
import { contractStore } from '$lib/stores/contract.store';
import { escrow } from '$lib/utils/escrow';
import { ensureEscrowReady } from '$lib/utils/escrow/v1/escrow';

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

async function loadContractIfAvailable(escrowId: string): Promise<boolean> {
	const existingContracts = await escrow.contractOps.getContracts({
		escrowIds: [escrowId],
		limit: 1
	});
	logQuoteAcceptanceRecovery('load-contract-if-available', {
		escrowId,
		matchCount: existingContracts.length
	});
	if (existingContracts.length > 0) {
		await contractStore.loadContractByEscrowId(escrowId);
		return true;
	}

	return false;
}

function extractEscrowIdFromReceipt(
	receipt: {
		logs?: Array<{
			topics: string[];
			data: string;
		}>;
	} | null,
	contract: {
		interface: {
			parseLog(args: {
				topics: string[];
				data: string;
			}): { name?: string; args: ArrayLike<unknown> } | null;
		};
	}
): string | null {
	if (!receipt?.logs?.length) {
		return null;
	}

	for (const log of receipt.logs) {
		try {
			const parsedLog = contract.interface.parseLog({
				topics: log.topics,
				data: log.data
			});
			if (parsedLog?.name === 'EscrowCreated') {
				return parsedLog.args[0]?.toString() ?? null;
			}
		} catch {
			// Ignore unrelated logs while scanning for EscrowCreated.
		}
	}

	return null;
}

async function loadEscrowChainDetails(
	contract: {
		getEscrow?: (escrowId: string) => Promise<{
			amount?: bigint;
			client?: string;
		}>;
	},
	escrowId: string
): Promise<{ amountRbtc?: string; clientRskAddress?: string }> {
	if (typeof contract.getEscrow !== 'function') {
		return {};
	}

	const escrowData = await contract.getEscrow(escrowId);
	return {
		amountRbtc:
			typeof escrowData?.amount === 'bigint' ? ethers.formatEther(escrowData.amount) : undefined,
		clientRskAddress:
			typeof escrowData?.client === 'string' && escrowData.client.trim().length > 0
				? escrowData.client.toLowerCase()
				: undefined
	};
}

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

		const { contract, provider } = await ensureEscrowReady(undefined, false);
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

		const escrowId = extractEscrowIdFromReceipt(receipt as unknown as { logs?: Array<{ topics: string[]; data: string }> }, contract) ?? input.escrowId ?? undefined;
		logQuoteAcceptanceRecovery('recover-escrow-id', {
			transactionHash,
			escrowId: escrowId ?? null,
			fallbackEscrowId: input.escrowId ?? null
		});
		if (!escrowId) {
			return {
				status: 'contract_sync_pending',
				transactionHash
			};
		}

		if (await loadContractIfAvailable(escrowId)) {
			logQuoteAcceptanceRecovery('recover-contract-ready-after-load', {
				transactionHash,
				escrowId
			});
			return {
				status: 'contract_ready',
				escrowId,
				transactionHash
			};
		}

		let amountRbtc = input.amountRbtc;
		let clientRskAddress = input.clientRskAddress;
		if (!amountRbtc || !clientRskAddress) {
			try {
				const chainDetails = await loadEscrowChainDetails(contract as { getEscrow?: (escrowId: string) => Promise<{ amount?: bigint; client?: string }> }, escrowId);
				amountRbtc ??= chainDetails.amountRbtc;
				clientRskAddress ??= chainDetails.clientRskAddress;
				logQuoteAcceptanceRecovery('recover-chain-details', {
					transactionHash,
					escrowId,
					amountRbtc: amountRbtc ?? null,
					clientRskAddress: clientRskAddress ?? null
				});
			} catch (error) {
				logQuoteAcceptanceRecovery('recover-chain-details-failed', {
					transactionHash,
					escrowId,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		if (!amountRbtc) {
			logQuoteAcceptanceRecovery('recover-awaiting-contract-hydration', {
				transactionHash,
				escrowId,
				reason: 'missing_amount_rbtc_after_chain_lookup'
			});
			return {
				status: 'contract_sync_pending',
				transactionHash,
				escrowId
			};
		}

		await escrow.contractOps.publishContractEvent({
			escrowId,
			taskId: input.serviceId,
			taskTitle: input.serviceTitle,
			taskDescription: input.serviceDescription,
			freelancerPubkey: input.freelancerPubkey,
			clientRskAddress,
			amount: amountRbtc,
			estimatedStartTime: input.estimatedStartTime,
			estimatedCompletionTime: input.estimatedCompletionTime,
			contextType: 'service',
			contextId: input.serviceId,
			contextTitle: input.serviceTitle,
			contextDescription: input.serviceDescription,
			contextVersionRef: input.contextVersionRef,
			serviceId: input.serviceId,
			serviceAddress: input.serviceAddress,
			serviceTitle: input.serviceTitle,
			purchaseMode: 'quote',
			quoteRequestId: input.quoteRequestId,
			proposalId: input.proposalId,
			proposalEventId: input.proposalEventId,
			selectedTierId: input.selectedTierId,
			pricingSnapshot: input.pricingSnapshot,
			agreementSnapshot: input.agreementSnapshot,
			transactionHash
		});
		logQuoteAcceptanceRecovery('recover-published-contract-event', {
			transactionHash,
			escrowId
		});

		if (await contractStore.loadContractByEscrowId(escrowId)) {
			logQuoteAcceptanceRecovery('recover-contract-ready-after-publish', {
				transactionHash,
				escrowId
			});
			return {
				status: 'contract_ready',
				escrowId,
				transactionHash
			};
		}

		logQuoteAcceptanceRecovery('recover-still-syncing-after-publish', {
			transactionHash,
			escrowId
		});
		return {
			status: 'contract_sync_pending',
			transactionHash,
			escrowId
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

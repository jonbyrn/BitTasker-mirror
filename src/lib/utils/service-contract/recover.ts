import type {
	ServiceContractAgreementSnapshot,
	ServiceContractPricingSnapshot
} from '$lib/types/contract';
import { contractStore } from '$lib/stores/contract.store';
import { escrow } from '$lib/utils/escrow';
import { ensureEscrowReady } from '$lib/utils/escrow/v1/escrow';

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

async function loadContractIfAvailable(escrowId: string): Promise<boolean> {
	const existingContracts = await escrow.contractOps.getContracts({
		escrowIds: [escrowId],
		limit: 1
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
				return parsedLog.args[0].toString();
			}
		} catch {
			// Ignore unrelated logs while scanning for EscrowCreated.
		}
	}

	return null;
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

		const { contract, provider } = await ensureEscrowReady(undefined, false);
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

		const escrowId = extractEscrowIdFromReceipt(receipt, contract) ?? input.escrowId ?? undefined;
		if (!escrowId) {
			return {
				status: 'contract_sync_pending',
				transactionHash
			};
		}

		if (await loadContractIfAvailable(escrowId)) {
			return {
				status: 'contract_ready',
				escrowId,
				transactionHash
			};
		}

		await escrow.contractOps.publishContractEvent({
			escrowId,
			taskId: input.serviceId,
			taskTitle: input.serviceTitle,
			taskDescription: input.serviceDescription,
			freelancerPubkey: input.freelancerPubkey,
			clientRskAddress: input.clientRskAddress,
			amount: input.amountRbtc,
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
			purchaseMode: 'instant_buy',
			instantOrderId: input.instantOrderId,
			selectedTierId: input.selectedTierId,
			pricingSnapshot: input.pricingSnapshot,
			agreementSnapshot: input.agreementSnapshot,
			transactionHash
		});

		if (await contractStore.loadContractByEscrowId(escrowId)) {
			return {
				status: 'contract_ready',
				escrowId,
				transactionHash
			};
		}

		return {
			status: 'contract_sync_pending',
			transactionHash,
			escrowId
		};
	} catch (error) {
		return {
			status: 'failed',
			transactionHash,
			error: error instanceof Error ? error.message : 'Unable to recover the Book Now contract.'
		};
	}
}

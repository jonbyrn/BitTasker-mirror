/**
 * @deprecated Service Contract Creation Awaiting
 *
 * This module exists for backward compatibility during migration.
 * New code should use the v2 pattern: tx.wait() + afterConfirmed()
 *
 * In v2, contract creation is awaited by:
 * 1. Calling createServiceContract() which returns tx + afterConfirmed
 * 2. Awaiting tx.wait() to get receipt
 * 3. Calling afterConfirmed(receipt) to finalize
 */

import { initContract } from '$lib/utils/contract';
import { getSecurePaymentContractAddress } from '$lib/utils/contract/v2/contractAddress';
import { parsePaymentContractCreatedPaymentId } from '$lib/utils/contract/v2/creation';
import { contractStore } from '$lib/stores/contract.store';
import { ethers } from 'ethers';
import abi from '$lib/utils/contract/v2/abi.json';

export const CONTRACT_CREATION_SYNCING_MESSAGE = 'Contract is being synced with Nostr relays...';

export interface ContractCreationResult {
	escrowId: string;
	transactionHash: string;
}

export interface WaitForContractCreationOptions {
	timeoutMs?: number;
	pollIntervalMs?: number;
}

/**
 * @deprecated Use the v2 pattern instead: tx.wait() + afterConfirmed(receipt)
 */
export function getContractCreationTimeoutReason(
	transactionHash: string,
	options?: { timeoutMs?: number }
): string {
	const timeout = options?.timeoutMs ?? 45000;
	return `Service contract funding timed out after ${Math.round(timeout / 1000)}s. Transaction: ${transactionHash}. Contract may still be created - check your contracts.`;
}

/**
 * @deprecated Use the v2 pattern instead: tx.wait() + afterConfirmed(receipt)
 *
 * Polls the blockchain for the transaction receipt and extracts the paymentId.
 * This is a fallback for scenarios where tx.wait() cannot be used directly.
 */
export async function waitForContractCreationByTransactionHash(
	transactionHash: string,
	options?: WaitForContractCreationOptions
): Promise<ContractCreationResult> {
	const { timeoutMs = 45000, pollIntervalMs = 3000 } = options ?? {};

	const contractAddress = getSecurePaymentContractAddress();
	const { provider } = await initContract(
		contractAddress,
		'rsk',
		abi as ethers.InterfaceAbi
	);

	const normalizedHash = transactionHash.trim().toLowerCase();
	const startTime = Date.now();

	while (Date.now() - startTime < timeoutMs) {
		try {
			const receipt = await provider.getTransactionReceipt(normalizedHash);
			
			if (receipt) {
				if (receipt.status !== 1) {
					throw new Error('Service contract funding transaction failed on-chain.');
				}

				const paymentId = parsePaymentContractCreatedPaymentId(receipt, contractAddress);
				const escrowId = String(paymentId);

				const loaded = await contractStore.loadContractByEscrowId(escrowId);
				if (loaded) {
					return { escrowId, transactionHash: normalizedHash };
				}

				await new Promise((resolve) => setTimeout(resolve, 2000));
				const retryLoaded = await contractStore.loadContractByEscrowId(escrowId);
				if (retryLoaded) {
					return { escrowId, transactionHash: normalizedHash };
				}

				throw new Error(CONTRACT_CREATION_SYNCING_MESSAGE);
			}
		} catch (error) {
			if (error instanceof Error && error.message === CONTRACT_CREATION_SYNCING_MESSAGE) {
				throw error;
			}
		}

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}

	throw new Error(getContractCreationTimeoutReason(transactionHash, { timeoutMs }));
}

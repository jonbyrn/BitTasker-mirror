import type { JsonRpcProvider, TransactionReceipt } from 'ethers';
import type { ServiceAcceptanceUnknownReasonCode } from '$lib/types/service-quote';

/**
 * @deprecated This finality module is part of the legacy service contract flow.
 * New service contracts should use the PaymentContractRune and v2 lifecycle.
 * See docs/service-escrow-version-abstraction.md for migration details.
 */

/**
 * Reorg safety threshold - blocks within this many blocks of the current tip
 * could potentially be reorganized out.
 */
export const REORG_SAFE_CONFIRMATIONS = 6;

export const SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS = 3;
export const SERVICE_ACCEPTANCE_CONFIRMATION_POLL_INTERVAL_MS = 3_000;
export const SERVICE_ACCEPTANCE_CONFIRMATION_MAX_RETRIES = 60;
export const SERVICE_ACCEPTANCE_FINALITY_POLICY_VERSION = 'rsk_rootstock_default_v1';

export class ServiceAcceptanceFinalityError extends Error {
	reasonCode: ServiceAcceptanceUnknownReasonCode;

	constructor(reasonCode: ServiceAcceptanceUnknownReasonCode, message: string) {
		super(message);
		this.reasonCode = reasonCode;
	}
}

export async function getTransactionConfirmationCount(
	receipt: TransactionReceipt | null | undefined
): Promise<number> {
	if (!receipt) {
		return 0;
	}

	const receiptWithConfirmations = receipt as TransactionReceipt & {
		confirmations?: number | (() => Promise<number>);
	};
	if (typeof receiptWithConfirmations.confirmations === 'number') {
		return receiptWithConfirmations.confirmations;
	}
	if (typeof receiptWithConfirmations.confirmations === 'function') {
		return await receiptWithConfirmations.confirmations();
	}

	return 1;
}

export async function waitForServiceAcceptanceFinality(
	provider: JsonRpcProvider,
	transactionHash: string,
	initialReceipt: TransactionReceipt
): Promise<TransactionReceipt> {
	const initialConfirmations = await getTransactionConfirmationCount(initialReceipt);
	if (initialConfirmations >= SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS) {
		return initialReceipt;
	}

	let lastError: unknown = null;

	for (let attempt = 0; attempt < SERVICE_ACCEPTANCE_CONFIRMATION_MAX_RETRIES; attempt += 1) {
		try {
			const nextReceipt = await provider.getTransactionReceipt(transactionHash);
			const confirmations = await getTransactionConfirmationCount(nextReceipt);
			if (nextReceipt && confirmations >= SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS) {
				return {
					...initialReceipt,
					...nextReceipt,
					logs: nextReceipt.logs ?? initialReceipt.logs ?? []
				} as TransactionReceipt;
			}
		} catch (error) {
			lastError = error;
		}

		await new Promise((resolve) =>
			setTimeout(resolve, SERVICE_ACCEPTANCE_CONFIRMATION_POLL_INTERVAL_MS)
		);
	}

	const reasonCode = classifyAmbiguityError(lastError) ?? 'pending_timeout';
	throw new ServiceAcceptanceFinalityError(
		reasonCode,
		`Service escrow confirmation did not reach the required ${SERVICE_ACCEPTANCE_REQUIRED_CONFIRMATIONS} confirmations.`
	);
}

/**
 * Classifies RPC/network errors into service acceptance reason codes.
 * Inlined from ambiguity-reason.ts for consolidation.
 * @deprecated Use standard error handling in v2 lifecycle instead.
 */
export function classifyAmbiguityError(
	error: unknown
): Exclude<ServiceAcceptanceUnknownReasonCode, 'reconciliation_deferred' | 'tx_replaced'> | null {
	if (!(error instanceof Error)) {
		return null;
	}

	const normalizedMessage = error.message.trim().toLowerCase();
	if (normalizedMessage.includes('timeout')) {
		return 'pending_timeout';
	}

	if (normalizedMessage.includes('nonce')) {
		return 'nonce_conflict';
	}

	if (
		normalizedMessage.includes('rpc') ||
		normalizedMessage.includes('network') ||
		normalizedMessage.includes('connection') ||
		normalizedMessage.includes('provider')
	) {
		return 'rpc_unavailable';
	}

	return null;
}

/**
 * @deprecated Re-exported for backward compatibility. Use classifyAmbiguityError instead.
 */
export const classifyServiceAcceptanceAmbiguityError = classifyAmbiguityError;

/**
 * Checks if a block is likely canonical (not reorged out).
 * A block is considered unsafe if it's within REORG_SAFE_CONFIRMATIONS blocks of the current tip.
 *
 * @param provider - The JsonRpcProvider to query
 * @param blockNumber - The block number to check
 * @returns true if the block is safe from reorg (>= 6 blocks deep), false if it could still be reorged
 * @throws Error if the provider is unavailable or block number is invalid
 */
export async function isBlockCanonical(
	provider: JsonRpcProvider,
	blockNumber: number
): Promise<boolean> {
	if (!blockNumber || blockNumber <= 0) {
		throw new Error('Invalid block number');
	}

	const currentBlock = await provider.getBlockNumber();
	const blocksDepth = currentBlock - blockNumber;

	// Block is canonical if it's deeper than the reorg threshold
	return blocksDepth >= REORG_SAFE_CONFIRMATIONS;
}

/**
 * Wait for a transaction receipt and verify block canonicality.
 * If the tx lands in a block that could still be reorged, poll until canonical or timeout.
 *
 * @param provider - The JsonRpcProvider
 * @param txHash - Transaction hash to wait for
 * @param options - Optional confirmation options
 * @returns The transaction receipt, or throws if canonicality cannot be established
 */
export async function waitForCanonicalTransaction(
	provider: JsonRpcProvider,
	txHash: string,
	options: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<TransactionReceipt> {
	const timeoutMs = options.timeoutMs ?? 120_000;
	const pollIntervalMs = options.pollIntervalMs ?? 10_000;
	const deadline = Date.now() + timeoutMs;

	const receipt = await provider.waitForTransaction(txHash);
	if (!receipt) {
		throw new Error('Transaction receipt not available');
	}

	// Check if the block is already canonical
	const blockNumber = receipt.blockNumber;
	if (!blockNumber) {
		throw new Error('Receipt missing block number');
	}

	const currentBlock = await provider.getBlockNumber();
	const blocksDepth = currentBlock - blockNumber;

	// If already deep enough, return immediately
	if (blocksDepth >= REORG_SAFE_CONFIRMATIONS) {
		return receipt;
	}

	// Otherwise poll until canonical or timeout
	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

		const newReceipt = await provider.getTransactionReceipt(txHash);
		if (!newReceipt?.blockNumber) continue;

		const newCurrentBlock = await provider.getBlockNumber();
		const newDepth = newCurrentBlock - newReceipt.blockNumber;

		if (newDepth >= REORG_SAFE_CONFIRMATIONS) {
			return newReceipt;
		}
	}

	throw new Error(`Transaction did not reach canonical state within ${timeoutMs}ms`);
}

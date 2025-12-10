/**
 * Transaction Type Classification Utility
 * 
 * Classifies transactions into appropriate types based on value transfer
 * direction and contract interaction status.
 */

import type { Transaction } from '$lib/types/wallet';

type TransactionType = 'send' | 'receive' | 'contract' | 'swap' | 'contract-function' | 'contract-send' | 'contract-receive';

interface ClassificationInput {
	from: string;
	to: string | null;
	value: string;
	isContractInteraction: boolean;
	contractType: 'escrow' | 'etherSwap' | 'unknown' | null;
	userAddress: string;
	isSwap?: boolean;
}

/**
 * Classify transaction type based on value transfer direction and contract status
 */
export function classifyTransactionType(input: ClassificationInput): TransactionType {
	const { from, to, value, isContractInteraction, contractType, userAddress, isSwap } = input;
	
	// Preserve existing swap detection
	if (isSwap && contractType === 'etherSwap') {
		return 'swap';
	}

	const normalizedFrom = from.toLowerCase();
	const normalizedTo = to?.toLowerCase() || '';
	const normalizedUserAddress = userAddress.toLowerCase();
	const txValue = BigInt(value || '0');

	const isFromUser = normalizedFrom === normalizedUserAddress;
	const isToUser = normalizedTo === normalizedUserAddress;
	const hasValue = txValue > BigInt(0);

	// Contract interactions
	if (isContractInteraction) {
		if (hasValue) {
			if (isFromUser) {
				// User sending value to contract
				return 'contract-send';
			} else if (isToUser) {
				// User receiving value from contract (internal transaction)
				return 'contract-receive';
			} else {
				// Contract interaction but user is not directly involved in value transfer
				// This could be an internal transaction we're tracking
				return 'contract-function';
			}
		} else {
			// Contract function call with no value transfer
			return 'contract-function';
		}
	}

	// Regular transactions
	if (isFromUser && isToUser) {
		// Self-transaction
		return 'send';
	} else if (isFromUser) {
		// User sending
		return 'send';
	} else if (isToUser) {
		// User receiving
		return 'receive';
	}

	// Fallback (shouldn't happen in normal cases)
	return 'contract';
}

/**
 * Determine if transaction involves value transfer to/from user
 */
export function hasValueTransfer(
	transaction: { from: string; to: string | null; value: string },
	userAddress: string
): { hasValue: boolean; isSend: boolean; isReceive: boolean } {
	const normalizedFrom = transaction.from.toLowerCase();
	const normalizedTo = transaction.to?.toLowerCase() || '';
	const normalizedUserAddress = userAddress.toLowerCase();
	const txValue = BigInt(transaction.value || '0');

	const hasValue = txValue > BigInt(0);
	const isSend = hasValue && normalizedFrom === normalizedUserAddress;
	const isReceive = hasValue && normalizedTo === normalizedUserAddress;

	return { hasValue, isSend, isReceive };
}


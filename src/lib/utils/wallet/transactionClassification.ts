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
		console.log(`[TransactionClassification] Classified as 'swap': isSwap=${isSwap}, contractType=${contractType}`);
		return 'swap';
	}

	const normalizedFrom = from.toLowerCase();
	const normalizedTo = to?.toLowerCase() || '';
	const normalizedUserAddress = userAddress.toLowerCase();
	const txValue = BigInt(value || '0');

	const isFromUser = normalizedFrom === normalizedUserAddress;
	const isToUser = normalizedTo === normalizedUserAddress;
	const hasValue = txValue > BigInt(0);

	// Log classification details for contract interactions
	if (isContractInteraction) {
		console.log(`[TransactionClassification] Contract interaction detected:`, {
			from: normalizedFrom.substring(0, 10) + '...',
			to: normalizedTo.substring(0, 10) + '...' || 'null',
			userAddress: normalizedUserAddress.substring(0, 10) + '...',
			value: value,
			hasValue,
			isFromUser,
			isToUser,
			contractType
		});
	}

	// Contract interactions
	if (isContractInteraction) {
		if (hasValue) {
			if (isFromUser) {
				// User sending value to contract
				console.log(`[TransactionClassification] Classified as 'contract-send': user sending value to contract`);
				return 'contract-send';
			} else if (isToUser) {
				// User receiving value from contract (internal transaction)
				console.log(`[TransactionClassification] Classified as 'contract-receive': user receiving value from contract`);
				return 'contract-receive';
			} else {
				// Contract interaction but user is not directly involved in value transfer
				// This could be an internal transaction we're tracking
				console.log(`[TransactionClassification] Classified as 'contract-function': contract interaction without direct user value transfer`);
				return 'contract-function';
			}
		} else {
			// Contract function call with no value transfer
			console.log(`[TransactionClassification] Classified as 'contract-function': contract call with no value transfer`);
			return 'contract-function';
		}
	}

	// Regular transactions
	if (isFromUser && isToUser) {
		// Self-transaction
		console.log(`[TransactionClassification] Classified as 'send': self-transaction`);
		return 'send';
	} else if (isFromUser) {
		// User sending
		console.log(`[TransactionClassification] Classified as 'send': user sending`);
		return 'send';
	} else if (isToUser) {
		// User receiving
		console.log(`[TransactionClassification] Classified as 'receive': user receiving`);
		return 'receive';
	}

	// Fallback (shouldn't happen in normal cases)
	console.log(`[TransactionClassification] Classified as 'contract': fallback classification`);
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


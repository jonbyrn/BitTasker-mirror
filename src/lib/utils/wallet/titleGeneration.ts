/**
 * Title Generation Utility
 * 
 * Generates human-readable transaction titles based on contract functions
 * or falls back to type-based titles.
 */

import type { Transaction } from '$lib/types/wallet';

// Human-readable title mapping for known escrow functions
const ESCROW_FUNCTION_TITLES: Record<string, string> = {
	'createEscrow': 'Created Escrow',
	'completeTask': 'Task Completed',
	'acceptTask': 'Tasker Released Payment',
	'cancelEscrow': 'Contract Cancelled',
	'disputeTask': 'Task Disputed',
	'proposeResolution': 'Dispute Resolution Proposed',
	'acceptProposal': 'Dispute Resolved',
	'resolveAfterTimelock': 'Dispute Resolved',
	'refundClient': 'Payment Refunded'
};

/**
 * Generate transaction title with priority:
 * 1. Known function with human-readable name
 * 2. Unknown function with decoded name
 * 3. Type-based fallback
 */
export function getTransactionTitle(tx: Partial<Transaction>): string {
	// Priority 1: Known contract function with human-readable name
	if (tx.contractMetadata?.functionName) {
		const humanReadable = ESCROW_FUNCTION_TITLES[tx.contractMetadata.functionName];
		if (humanReadable) {
			return humanReadable;
		}
	}

	// Priority 2: Unknown contract function with decoded name
	if (tx.type === 'contract-function' && tx.contractFunction) {
		return `Contract Function: ${tx.contractFunction}`;
	}

	// Priority 3: Unknown contract function with selector only
	if (tx.type === 'contract-function' && tx.contractMetadata?.functionSelector) {
		return `Contract Function: ${tx.contractMetadata.functionSelector}`;
	}

	// Priority 4: Fallback to type-based title
	switch (tx.type) {
		case 'contract-send':
		case 'send':
			return 'Sent';
		case 'contract-receive':
		case 'receive':
			return 'Received';
		case 'contract-function':
			return 'Contract Function';
		case 'swap':
			return 'Swap Claimed';
		case 'contract':
			return 'Contract Interaction';
		default:
			return 'Transaction';
	}
}

/**
 * Get translation key for transaction title (for i18n support)
 */
export function getTransactionTitleKey(tx: Transaction): string {
	if (tx.contractMetadata?.functionName) {
		const key = ESCROW_FUNCTION_TITLES[tx.contractMetadata.functionName];
		if (key) {
			// Convert to translation key format
			return `wallet.transaction.contract.${tx.contractMetadata.functionName.toLowerCase()}`;
		}
	}

	switch (tx.type) {
		case 'contract-send':
		case 'send':
			return 'wallet.sent';
		case 'contract-receive':
		case 'receive':
			return 'wallet.received';
		case 'contract-function':
			return 'wallet.transaction.type.contract_function';
		case 'swap':
			return 'wallet.swap.claimed';
		default:
			return 'wallet.transaction';
	}
}


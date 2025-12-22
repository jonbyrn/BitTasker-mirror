/**
 * Title Generation Utility
 * 
 * Generates human-readable transaction titles based on contract functions
 * or falls back to type-based titles.
 */

import type { Transaction } from '$lib/types/wallet';

// Human-readable title mapping for known escrow functions
// Different titles based on whether value is transferred
interface FunctionTitles {
	send?: string;      // Title when sending money TO contract
	receive?: string;   // Title when receiving money FROM contract
	noValue?: string;   // Title when no value transfer (pure function call)
}

const ESCROW_FUNCTION_TITLES: Record<string, FunctionTitles> = {
	'createEscrow': {
		send: 'Contract Funded',
		noValue: 'Contract Created'
	},
	'completeTask': {
		noValue: 'Task Completed'
	},
	'acceptTask': {
		receive: 'Payment Received',
		noValue: 'Task Accepted'
	},
	'cancelEscrow': {
		receive: 'Refund Received',
		noValue: 'Contract Cancelled'
	},
	'disputeTask': {
		noValue: 'Task Disputed'
	},
	'proposeResolution': {
		noValue: 'Resolution Proposed'
	},
	'acceptProposal': {
		noValue: 'Dispute Resolved'
	},
	'resolveAfterTimelock': {
		noValue: 'Dispute Resolved'
	},
	'refundClient': {
		receive: 'Refund Received',
		noValue: 'Refund Processed'
	}
};

/**
 * Generate transaction title with priority:
 * 1. Known function with value-aware human-readable name
 * 2. Unknown function with decoded name
 * 3. Type-based fallback
 */
export function getTransactionTitle(tx: Partial<Transaction>): string {
	// Priority 1: Known contract function with value-aware titles
	if (tx.contractMetadata?.functionName) {
		const titleConfig = ESCROW_FUNCTION_TITLES[tx.contractMetadata.functionName];
		if (titleConfig) {
			const hasValue = tx.contractMetadata.hasValue;
			
			// Return appropriate title based on transaction type and value
			if (hasValue && tx.type === 'contract-send' && titleConfig.send) {
				return titleConfig.send;
			}
			if (hasValue && tx.type === 'contract-receive' && titleConfig.receive) {
				return titleConfig.receive;
			}
			if (!hasValue && titleConfig.noValue) {
				return titleConfig.noValue;
			}
			
			// Fallback if no appropriate title found in config
			if (titleConfig.send) return titleConfig.send;
			if (titleConfig.receive) return titleConfig.receive;
			if (titleConfig.noValue) return titleConfig.noValue;
		}
	}

	// Priority 2: Unknown contract function with decoded name (show function name directly)
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
			return 'Contract Function Called';
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


/**
 * Transaction History Processing Utility
 *
 * Single-pass processing of blockchain transactions with ALL properties computed:
 * - Contract detection (Escrow, EtherSwap)
 * - Transaction type classification
 * - Display properties (border, icon, title)
 * - Network information (icon, display name, explorer URL)
 * - Running balance calculation
 * - Icon components (ready to render)
 * - Everything needed for UI rendering
 * - Internal transaction handling (for escrow payouts)
 */

import type { Transaction } from '@bittasker/wallet-core';
import type { ComponentType } from 'svelte';
import type {
	InternalTransaction,
	ExtendedTransaction,
	ProcessedTransaction
} from '$lib/types/wallet';
import { ESCROW_CONTRACT_ADDRESSES, statusUI } from '$lib/utils/constants/transactions.constants';
import { getSwapAddress, weiToSatoshi } from '@bittasker/wallet-core';
import { parseFunction } from './functionParsing';
import IconArrowUpBold from '~icons/mdi/arrow-up-bold';
import IconArrowDownBold from '~icons/mdi/arrow-down-bold';
import IconFileDocumentOutline from '~icons/mdi/file-document-outline';
import { getBlockscoutApiUrl as resolveBlockscoutApiUrl } from './explorerProxy';

type Component = typeof IconArrowUpBold;

// Re-export ProcessedTransaction for backward compatibility
export type { ProcessedTransaction } from '$lib/types/wallet';

// Contract addresses cache
interface ContractAddresses {
	etherSwap: string | null;
	escrowAddresses: string[];
}

let contractAddressesCache: ContractAddresses | null = null;

/**
 * Get contract addresses (cached for session)
 */
async function getContractAddresses(): Promise<ContractAddresses> {
	if (contractAddressesCache) {
		return contractAddressesCache;
	}

	// Fetch EtherSwap address from Boltz API
	const etherSwapAddress = await getSwapAddress();

	const rskNetwork = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
	const escrowAddressesArray = ESCROW_CONTRACT_ADDRESSES[rskNetwork];

	if (!escrowAddressesArray || !Array.isArray(escrowAddressesArray)) {
		console.error('[getContractAddresses] Invalid escrow addresses configuration', {
			rskNetwork,
			hasConfig: !!ESCROW_CONTRACT_ADDRESSES[rskNetwork]
		});
		throw new Error(`Invalid escrow addresses configuration for network: ${rskNetwork}`);
	}

	const escrowAddresses = escrowAddressesArray
		.filter((addr): addr is string => addr != null && typeof addr === 'string')
		.map((addr) => addr.toLowerCase());

	contractAddressesCache = {
		etherSwap: etherSwapAddress?.toLowerCase() || null,
		escrowAddresses
	};

	return contractAddressesCache;
}

/**
 * Clear contract addresses cache (useful for testing or network changes)
 */
export function clearContractAddressesCache(): void {
	contractAddressesCache = null;
}

/**
 * Extract human-readable method name from transaction
 * Uses multiple strategies to get the best method name
 */
function extractMethodName(tx: Transaction, isEscrowContract: boolean): string | undefined {
	// Strategy 1: Use decoded_input.method_call (most reliable, from API)
	if (tx.decoded_input?.method_call) {
		// Extract just the function name (before parentheses)
		const match = tx.decoded_input.method_call.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
		return match ? match[1] : tx.decoded_input.method_call;
	}

	// Strategy 2: Parse raw_input using our function parser (for escrow contracts)
	if (isEscrowContract && tx.raw_input) {
		const parsed = parseFunction(tx.raw_input, 'escrow');
		if (parsed?.functionName) {
			return parsed.functionName;
		}
	}

	// Strategy 3: Parse raw_input for unknown contracts
	if (tx.raw_input) {
		const parsed = parseFunction(tx.raw_input, 'unknown');
		if (parsed?.functionName) {
			return parsed.functionName;
		}
	}

	// No human-readable name available
	return undefined;
}

/**
 * Check if address is an escrow contract
 */
function isEscrowContract(address: string, escrowAddresses: string[]): boolean {
	if (!address || typeof address !== 'string') {
		return false;
	}
	const lowerAddress = address.toLowerCase();
	return escrowAddresses.some((escrow) => escrow === lowerAddress);
}

/**
 * Get network information based on network and environment
 * Computes explorer URL dynamically based on environment
 */
const rskNetwork = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
const rskExplorerBaseUrl =
	rskNetwork === 'mainnet'
		? 'https://rootstock.blockscout.com/tx/'
		: 'https://rootstock-testnet.blockscout.com/tx/';

const arbExplorerBaseUrl =
	rskNetwork === 'mainnet'
		? 'https://arbitrum.blockscout.com/tx/'
		: 'https://arbitrum-sepolia.blockscout.com/tx/';

const networks = {
	rsk: {
		icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
		displayName: 'Rootstock (Bitcoin)',
		explorerBaseUrl: rskExplorerBaseUrl
	},
	bsc: {
		icon: '/images/chains/Binance-logo.svg',
		displayName: 'Binance Smart Chain',
		explorerBaseUrl: 'https://bscscan.com/tx/'
	},
	arb: {
		icon: '/images/chains/arbitrum.png',
		displayName: 'Arbitrum',
		explorerBaseUrl: arbExplorerBaseUrl
	},
	lightning: {
		icon: '/images/chains/lightning.svg',
		displayName: 'Lightning Bitcoin',
		explorerBaseUrl: rskExplorerBaseUrl
	}
};

/**
 * Determine Boltz swap type based on method and caller
 *
 * Submarine Swap (Chain → Lightning): User locks RBTC to receive Lightning
 * Reverse Swap (Lightning → Chain): User claims RBTC after paying Lightning
 * Chain Swap (Chain → Chain): Cross-chain swaps (e.g., L-BTC ↔ RBTC)
 */
function determineBoltzSwapType(
	method: string | undefined,
	fromAddress: string,
	userAddress: string
): 'submarine' | 'reverse' | 'chain' | undefined {
	if (!method) return undefined;

	const methodLower = method.toLowerCase();
	const isFromUser = fromAddress === userAddress;

	// Chain swaps use 'lockup' method
	if (methodLower.includes('lockup')) {
		return 'chain';
	}

	// Submarine vs Reverse detection for lock/claim/refund
	if (methodLower.includes('lock')) {
		// lock called by user = submarine (user locking to get Lightning)
		// lock called by Boltz = reverse (Boltz locking for user to claim)
		return isFromUser ? 'submarine' : 'reverse';
	}

	if (methodLower.includes('claim')) {
		// claim called by user = reverse (user claiming Lightning → RBTC)
		// claim called by Boltz = submarine (Boltz claiming after user paid Lightning)
		return isFromUser ? 'reverse' : 'submarine';
	}

	if (methodLower.includes('refund')) {
		// Refunds can happen for both submarine and reverse swaps
		// We'll default to reverse since user typically refunds their own failed swaps
		return 'reverse';
	}

	return undefined;
}

/**
 * Detect transaction type based on contract interaction
 */
function detectTransactionType(
	tx: ExtendedTransaction,
	userAddress: string,
	contractAddresses: ContractAddresses
): {
	type: 'send' | 'receive' | 'swap' | 'contract';
	subType?: 'lock' | 'claim' | 'refund';
	methodName?: string;
	swapType?: 'submarine' | 'reverse' | 'chain';
	isInternalEscrowPayout?: boolean;
} {
	// Add null checks to prevent "Cannot read properties of null" errors
	if (!tx.to || !tx.to.hash || !tx.from || !tx.from.hash) {
		// If transaction data is incomplete, default to contract type
		return {
			type: 'contract',
			methodName: 'unknown'
		};
	}

	if (!userAddress) {
		// If user address is missing, we can't determine send/receive
		return {
			type: 'contract',
			methodName: 'unknown'
		};
	}

	const toAddress = tx.to.hash.toLowerCase();
	const fromAddress = tx.from.hash.toLowerCase();
	const userAddr = userAddress.toLowerCase();

	// Handle internal transactions
	if (tx._isInternal) {
		const isFromEscrow = isEscrowContract(fromAddress, contractAddresses.escrowAddresses);
		const isToEscrow = isEscrowContract(toAddress, contractAddresses.escrowAddresses);

		// Internal transaction FROM escrow contract TO user = funds received (taskee getting paid)
		if (isFromEscrow && toAddress === userAddr) {
			return {
				type: 'receive',
				methodName: 'fundsReleased',
				isInternalEscrowPayout: true
			};
		}

		// Internal transaction FROM user TO escrow contract = funds sent (shouldn't happen in practice)
		if (isToEscrow && fromAddress === userAddr) {
			return {
				type: 'send',
				methodName: 'internalEscrowFunding'
			};
		}

		// Other internal transactions (user receiving from non-escrow contract)
		if (toAddress === userAddr) {
			return {
				type: 'receive',
				methodName: 'internalTransfer'
			};
		}

		// Other internal transactions (user sending via contract)
		if (fromAddress === userAddr) {
			return {
				type: 'send',
				methodName: 'internalTransfer'
			};
		}

		// Internal transaction not involving user (shouldn't happen as we filter by user address)
		return {
			type: 'contract',
			methodName: 'internalTransaction'
		};
	}

	// Check if it's a contract interaction
	// Add null check for tx.to.is_contract
	if (!tx.to.is_contract) {
		// Simple transfer
		return {
			type: fromAddress === userAddr ? 'send' : 'receive'
		};
	}

	// Check if it's Escrow contract first (for method name extraction)
	const isEscrow = isEscrowContract(toAddress, contractAddresses.escrowAddresses);

	// Get method name (with escrow flag for better parsing)
	const methodName = extractMethodName(tx, isEscrow);

	// Check if it's EtherSwap contract (by address OR by contract name from API)
	const isEtherSwap =
		(contractAddresses.etherSwap && toAddress === contractAddresses.etherSwap) ||
		tx.to.name === 'EtherSwap';

	if (isEtherSwap) {
		// Determine swap subtype
		let subType: 'lock' | 'claim' | 'refund' | undefined;
		if (methodName?.toLowerCase().includes('lock')) {
			subType = 'lock';
		} else if (methodName?.toLowerCase().includes('claim')) {
			subType = 'claim';
		} else if (methodName?.toLowerCase().includes('refund')) {
			subType = 'refund';
		}

		// Determine Boltz swap type (submarine, reverse, or chain)
		const swapType = determineBoltzSwapType(methodName, fromAddress, userAddr);

		return {
			type: 'swap',
			subType,
			methodName,
			swapType
		};
	}

	// Return contract type (escrow or unknown)
	return {
		type: 'contract',
		methodName
	};
}

/**
 * Known contract method name → i18n translation key (e.g. 'wallet.transaction.createescrow').
 * These are escrow/task lifecycle methods with translations in the locale files.
 */
const CONTRACT_METHOD_I18N_KEYS: Record<string, string> = {
	createescrow: 'wallet.transaction.createescrow',
	completetask: 'wallet.transaction.completetask',
	accepttask: 'wallet.transaction.accepttask',
	funds_released: 'wallet.transaction.funds_released',
	disputetask: 'wallet.transaction.disputetask',
	disputeresolved: 'wallet.transaction.disputeresolved',
	disputeunresolved: 'wallet.transaction.disputeunresolved',
	resolveaftertimelock: 'wallet.transaction.resolveaftertimelock',
	acceptproposal: 'wallet.transaction.acceptproposal',
	proposeresolution: 'wallet.transaction.proposeresolution',
	refundescrow: 'wallet.transaction.refundescrow',
	refundclient: 'wallet.transaction.refundclient',
	transferownership: 'wallet.transaction.transferownership',
	renounceownership: 'wallet.transaction.renounceownership',
	pause: 'wallet.transaction.pause',
	unpause: 'wallet.transaction.unpause',
	disputeescrow: 'wallet.transaction.disputeescrow',
	resolvedispute: 'wallet.transaction.resolvedispute',
	cancelescrow: 'wallet.transaction.cancelescrow'
};

/**
 * Known contract method name → short human-readable label.
 * DeFi methods (bridge, swap, approve, transfer) that don't have i18n translations.
 */
const METHOD_LABELS: Record<string, string> = {
	swapandstartbridgetokensviastargate: 'Cross-Chain Bridge',
	swapandstartbridgealltokensviastargate: 'Cross-Chain Bridge',
	swapandstartbridgngtokensviastargate: 'Cross-Chain Bridge',
	startbridgeportaltokens: 'Cross-Chain Bridge',
	bridgetokens: 'Bridge',
	swap: 'Swap',
	swapexacttokensfortokens: 'Swap',
	swaptokensforexacttokens: 'Swap',
	multicall: 'Batch Transaction',
	approve: 'Approve',
	transfer: 'Transfer',
	transferfrom: 'Transfer'
};

/**
 * Convert a contract method name into a display title.
 * Priority: i18n key (escrow/task) → human-readable label (DeFi) → camelCase split (unknown).
 */
function formatContractMethodName(methodName: string): string {
	const key = methodName.toLowerCase();
	if (CONTRACT_METHOD_I18N_KEYS[key]) return CONTRACT_METHOD_I18N_KEYS[key];
	if (METHOD_LABELS[key]) return METHOD_LABELS[key];
	return methodName
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.replace(/^./, (c) => c.toUpperCase());
}

/**
 * Determine all display properties for UI
 * Returns icon components directly and translation keys for titles
 */
function determineDisplayProperties(
	type: 'send' | 'receive' | 'swap' | 'contract',
	subType?: 'lock' | 'claim' | 'refund',
	methodName?: string,
	hasValue?: boolean,
	isInternalEscrowPayout?: boolean
): {
	displayType: 'send' | 'receive' | 'swap-claim' | 'contract-function';
	borderColor: 'warning' | 'success' | 'info';
	iconConfig: {
		base: Component;
		overlay: Component | null;
	};
	title: string;
} {
	// Internal escrow payout (funds released to taskee)
	if (isInternalEscrowPayout) {
		return {
			displayType: 'receive',
			borderColor: 'success',
			iconConfig: { base: IconFileDocumentOutline, overlay: IconArrowDownBold },
			title: 'wallet.transaction.funds_released'
		};
	}

	// Swap transactions
	if (type === 'swap') {
		if (subType === 'claim' || subType === 'refund') {
			return {
				displayType: 'swap-claim',
				borderColor: 'success',
				iconConfig: { base: IconArrowDownBold, overlay: null },
				title: 'wallet.received'
			};
		}
		// lock is treated as send
		return {
			displayType: 'send',
			borderColor: 'warning',
			iconConfig: { base: IconArrowUpBold, overlay: null },
			title: 'wallet.sent'
		};
	}

	// Regular receive
	if (type === 'receive') {
		return {
			displayType: 'receive',
			borderColor: 'success',
			iconConfig: { base: IconArrowDownBold, overlay: null },
			title: 'wallet.received'
		};
	}

	// Regular send
	if (type === 'send') {
		return {
			displayType: 'send',
			borderColor: 'warning',
			iconConfig: { base: IconArrowUpBold, overlay: null },
			title: 'wallet.sent'
		};
	}

	// Contract interactions
	if (type === 'contract') {
		// Special handling for escrow functions that transfer value
		if (hasValue && methodName) {
			const methodLower = methodName.toLowerCase();

			// createEscrow (v1) or createPaymentContract (v2) with value → Contract Funded
			if (methodLower.includes('createescrow') || methodLower.includes('createpaymentcontract')) {
				return {
					displayType: 'send',
					borderColor: 'warning',
					iconConfig: { base: IconFileDocumentOutline, overlay: IconArrowUpBold },
					title: 'wallet.transaction.createescrow'
				};
			}
			// acceptTask with value → display as receive
			if (methodLower.includes('accepttask')) {
				return {
					displayType: 'receive',
					borderColor: 'success',
					iconConfig: { base: IconFileDocumentOutline, overlay: IconArrowDownBold },
					title: `wallet.transaction.${methodLower}`
				};
			}
		}

		// All other contract functions
		const knownContractKeys = new Set([
			'createescrow',
			'completetask',
			'accepttask',
			'funds_released',
			'disputetask',
			'disputeresolved',
			'disputeunresolved',
			'resolveaftertimelock',
			'acceptproposal',
			'proposeresolution',
			'refundescrow',
			'refundclient',
			'transferownership',
			'renounceownership',
			'pause',
			'unpause',
			'disputeescrow',
			'resolvedispute',
			'cancelescrow'
		]);
		const methodKey = methodName?.toLowerCase() ?? '';
		return {
			displayType: 'contract-function',
			borderColor: 'info',
			iconConfig: { base: IconFileDocumentOutline, overlay: null },
			title: methodName
				? formatContractMethodName(methodName)
				: 'wallet.transaction.contract_function'
		};
	}

	// Default fallback
	return {
		displayType: 'contract-function',
		borderColor: 'info',
		iconConfig: { base: IconFileDocumentOutline, overlay: null },
		title: 'wallet.transaction.unknown'
	};
}

/**
 * Convert transaction status from API to our standard format
 */
function normalizeStatus(status: string): 'confirmed' | 'pending' | 'failed' {
	if (!status || typeof status !== 'string') {
		return 'pending'; // Default to pending if status is invalid
	}
	const statusLower = status.toLowerCase();
	if (statusLower === 'ok' || statusLower === 'success' || statusLower === 'confirmed') {
		return 'confirmed';
	}
	if (statusLower === 'pending') {
		return 'pending';
	}
	return 'failed';
}

/**
 * Process raw transactions into clean, typed format with ALL properties computed
 * Single-pass processing including running balance calculation
 *
 * Now includes internal transactions to capture escrow payouts to freelancers
 *
 * @param rawTransactions - Raw transactions from blockchain API
 * @param userAddress - User's wallet address
 * @param network - Network type ('rsk' or 'arb')
 * @param currentBalanceSats - Current balance in satoshis (for running balance calculation)
 * @returns Processed transactions with all display properties and running balances
 */
export async function processTransactions(
	rawTransactions: Transaction[],
	userAddress: string,
	network: 'rsk' | 'bsc' | 'arb',
	currentBalanceSats: number
): Promise<ProcessedTransaction[]> {
	try {
		// Validate userAddress
		if (!userAddress || typeof userAddress !== 'string') {
			if (import.meta.env.DEV) {
				console.error('[processTransactions] Invalid userAddress', {
					userAddress,
					type: typeof userAddress
				});
			}
			return []; // Return empty array if user address is invalid
		}

		// Fetch contract addresses once
		const contractAddresses = await getContractAddresses();

		// Fetch internal transactions
		const internalTransactions = await fetchInternalTransactions(userAddress, network);

		// Convert internal transactions to ExtendedTransaction format
		const convertedInternalTxs = internalTransactions
			.map((internal) => convertInternalToTransaction(internal, contractAddresses.escrowAddresses))
			.filter((tx): tx is ExtendedTransaction => tx !== null);

		// Merge regular and internal transactions
		const allTransactions: ExtendedTransaction[] = [...rawTransactions, ...convertedInternalTxs];

		// Deduplicate by hash + internal index (regular txs don't have _internalIndex)
		const uniqueTransactions = Array.from(
			new Map(
				allTransactions.map((tx) => {
					const key =
						tx.hash +
						(tx._isInternal && tx._internalIndex !== undefined
							? `-internal-${tx._internalIndex}`
							: '');
					return [key, tx];
				})
			).values()
		);

		// Process all transactions in single iteration
		const processed = uniqueTransactions
			.filter((tx) => {
				// Filter out transactions with missing required fields
				if (!tx.to || !tx.to.hash || !tx.from || !tx.from.hash) {
					if (import.meta.env.DEV) {
						console.warn(
							'[processTransactions] Skipping transaction with missing to/from addresses',
							{
								hash: tx.hash,
								hasTo: !!tx.to,
								hasFrom: !!tx.from,
								toHash: tx.to?.hash,
								fromHash: tx.from?.hash
							}
						);
					}
					return false;
				}
				return true;
			})
			.map((tx) => {
				// Detect transaction type
				const { type, subType, methodName, swapType, isInternalEscrowPayout } =
					detectTransactionType(
						tx as Transaction & { _isInternal?: boolean },
						userAddress,
						contractAddresses
					);

				// Extract transaction value
				// For swap claims/refunds, the value field is 0, but the actual amount is in decoded_input.parameters
				let valueSats: number;
				try {
					valueSats = Number(weiToSatoshi(BigInt(tx.value || '0')));
				} catch {
					valueSats = 0;
				}

				// Special handling for swap claims and refunds - extract amount from decoded input
				if (type === 'swap' && (subType === 'claim' || subType === 'refund')) {
					try {
						if (tx.decoded_input?.parameters) {
							const amountParam = tx.decoded_input.parameters.find(
								(p) => p.name === 'amount'
							);
							if (amountParam?.value) {
								valueSats = Number(weiToSatoshi(BigInt(amountParam.value)));
							}
						}
					} catch {
						// Keep original valueSats from tx.value
					}
				}

				// Check if transaction has value
				const hasValue = valueSats > 0;

				// Determine all display properties in one go (including icon config and translation keys)
				const { displayType, borderColor, iconConfig, title } = determineDisplayProperties(
					type,
					subType,
					methodName,
					hasValue,
					isInternalEscrowPayout
				);

				// Calculate fee in sats (internal transactions have no gas fees)
				const feeSats = tx._isInternal ? 0 : Number(weiToSatoshi(BigInt(tx.fee?.value || '0')));

				// Determine network - Lightning for submarine/reverse swaps, otherwise use provided network
				// Get network information once
				const isLightningSwap =
					type === 'swap' && (swapType === 'submarine' || swapType === 'reverse');
				const networkInfo = networks[isLightningSwap ? 'lightning' : network];

				// Build explorer URL
				const explorerUrl = tx.hash ? `${networkInfo.explorerBaseUrl}${tx.hash}` : null;

				// Build processed transaction with all properties computed
				// Note: We've already filtered out transactions with missing to/from, but add defensive checks
				const txNormalized = normalizeStatus(tx.status || 'pending');
				const isFailedClaim =
					displayType === 'swap-claim' && (txNormalized === 'failed' || tx.status === 'error');

				const processedTx: ProcessedTransaction = {
					// Core fields
					hash: tx.hash,
					from: tx.from?.hash || '',
					to: tx.to?.hash || '',
					value: valueSats.toString(),
					timestamp: tx.timestamp,
					status: statusUI[
						isFailedClaim ? 'failed' : (txNormalized as keyof typeof statusUI)
					] as unknown as { label: string; icon: ComponentType; color: string },
					txStatus: isFailedClaim ? 'failed' : txNormalized,
					network: isLightningSwap ? 'lightning' : network,

					// Computed fields
					type,
					subType,
					methodName,

					// Display helpers (all computed in one pass)
					displayType,
					borderColor: isFailedClaim ? 'error' : borderColor,
					iconConfig: iconConfig as unknown as {
						base: Record<string, unknown>;
						overlay: ComponentType | null;
					},
					title: isFailedClaim ? 'wallet.swap.failed_receive' : title,

					// Network information (computed once)
					networkIcon: networkInfo.icon,
					networkDisplayName: networkInfo.displayName,
					explorerUrl,

					// Fee
					feeSats,

					// Balance (will be calculated below)
					balanceAfter: 0, // Placeholder, calculated in next step

					// Raw data
					rawMethod: tx.method || undefined,
					decodedInput: (tx.decoded_input || undefined) as
						| string
						| Record<string, unknown>
						| undefined
				};

				if (network === 'arb' && tx.token_transfers && tx.token_transfers.length > 0) {
					const transfer = tx.token_transfers[0];
					const tokenAddr = transfer.token?.address?.toLowerCase();
					if (tokenAddr === '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9') {
						processedTx.tokenSymbol = 'USDT0';
					} else if (tokenAddr === '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f') {
						processedTx.tokenSymbol = 'wBTC';
					} else if (tokenAddr === '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40') {
						processedTx.tokenSymbol = 'tBTC';
					}
				}

				return processedTx;
			});

		return processed;
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('[processTransactions] Error processing transactions:', errorMessage, error);

		// Re-throw so the caller can surface the error to the user
		throw error;
	}
}

/**
 * Get explorer API URL based on network
 */
function getExplorerApiUrl(network: 'rsk' | 'bsc' | 'arb'): string {
	if (network === 'rsk') {
		return resolveBlockscoutApiUrl();
	}
	if (network === 'arb') {
		return rskNetwork === 'mainnet'
			? 'https://arbitrum.blockscout.com/api/v2'
			: 'https://arbitrum-sepolia.blockscout.com/api/v2';
	}
	return '';
}

/**
 * TODO: To be added to wallet-core
 * Fetch internal transactions from Blockscout API
 * Internal transactions show value transfers that occur inside smart contract execution
 * This is crucial for tracking escrow payouts to freelancers
 */
async function fetchInternalTransactions(
	userAddress: string,
	network: 'rsk' | 'bsc' | 'arb'
): Promise<InternalTransaction[]> {
	// Arbitrum and BSC internal transactions not yet supported
	// Only fetch for RSK network which uses Blockscout
	if (network === 'arb' || network === 'bsc') {
		return [];
	}

	try {
		const explorerApiUrl = getExplorerApiUrl(network);
		const url = `${explorerApiUrl}/addresses/${userAddress}/internal-transactions`;

		const response = await fetch(url, {
			signal: AbortSignal.timeout(10000)
		});

		if (!response.ok) {
			// 404 is expected for addresses without internal transactions - only log in dev mode
			if (import.meta.env.DEV && response.status !== 404) {
				console.error(`Failed to fetch internal transactions: ${response.status}`);
			}
			return [];
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.includes('application/json')) {
			if (import.meta.env.DEV) {
				console.warn(
					'Internal transactions API returned non-JSON (proxy misconfigured?) — skipping'
				);
			}
			return [];
		}

		const data = await response.json();

		// Blockscout returns { items: [...] }
		if (!data.items || !Array.isArray(data.items)) {
			// Only log in dev mode - API may return unexpected formats
			if (import.meta.env.DEV) {
				console.error('Invalid internal transactions response format:', data);
			}
			return [];
		}

		return data.items;
	} catch (error) {
		// Only log errors in dev mode - network errors are expected
		if (import.meta.env.DEV) {
			console.error('Error fetching internal transactions:', error);
		}
		return [];
	}
}

/**
 * Convert internal transaction to ExtendedTransaction format
 * This allows internal transactions to be processed alongside regular transactions
 *
 * @param internal - Internal transaction from Blockscout API
 * @param escrowAddresses - List of escrow contract addresses to filter
 * @returns ExtendedTransaction or null if should be filtered out
 */
function convertInternalToTransaction(
	internal: InternalTransaction,
	escrowAddresses: string[]
): ExtendedTransaction | null {
	// Only process successful internal transactions
	if (!internal.success) {
		return null;
	}

	// Validate that from and to addresses exist
	if (!internal.from || !internal.from.hash || !internal.to || !internal.to.hash) {
		if (import.meta.env.DEV) {
			console.warn(
				'[convertInternalToTransaction] Missing from/to addresses in internal transaction',
				{
					internal,
					hasFrom: !!internal.from,
					hasTo: !!internal.to
				}
			);
		}
		return null;
	}

	// Only process internal transactions involving escrow contracts
	const fromLower = internal.from.hash.toLowerCase();
	const toLower = internal.to.hash.toLowerCase();
	const isFromEscrow = escrowAddresses.some((addr) => addr === fromLower);
	const isToEscrow = escrowAddresses.some((addr) => addr === toLower);

	// Filter: only include transactions that involve escrow contracts
	if (!isFromEscrow && !isToEscrow) {
		return null;
	}

	// Create an ExtendedTransaction object compatible with our processing
	// For internal transactions, we use data from the internal tx with minimal extras
	const extendedTx: ExtendedTransaction = {
		hash: internal.transaction_hash,
		from: internal.from,
		to: internal.to,
		value: internal.value,
		gas_used: '0',
		gas_price: '0',
		gas_limit: internal.gas_limit,
		block_number: internal.block_number,
		timestamp: internal.timestamp,
		status: 'ok',
		nonce: 0,
		position: 0,
		confirmations: 0,
		raw_input: '0x',
		method: null,
		decoded_input: null,
		transaction_types: ['call'],
		token_transfers: null,
		max_fee_per_gas: null,
		max_priority_fee_per_gas: null,
		base_fee_per_gas: null,
		priority_fee: null,
		transaction_burnt_fee: null,
		result: 'success',
		revert_reason: null,
		created_contract: null,
		is_pending_update: false,
		type: 0,
		has_error_in_internal_transactions: false,
		fee: {
			type: 'maximum',
			value: '0'
		},
		exchange_rate: null,
		historic_exchange_rate: null,
		confirmation_duration: null,
		token_transfers_overflow: null,
		transaction_tag: null,
		authorization_list: [],
		actions: [],
		// Extended fields to identify internal transactions
		_isInternal: true,
		_internalIndex: internal.internal_transaction_index
	};

	return extendedTx;
}

/**
 * Minimal shape of a Blockscout v2 transaction item for Arbitrum fetching.
 */
interface BlockscoutTransactionItem {
	hash: string;
	from: { hash: string; is_contract?: boolean; name?: string | null };
	to: { hash: string; is_contract?: boolean; name?: string | null } | null;
	value: string;
	gas_used: string;
	gas_price: string;
	gas_limit?: string;
	block_number: number;
	timestamp: string;
	status: string;
	method?: string | null;
	decoded_input?: {
		method_call?: string;
		method_id?: string;
		parameters?: { name: string; type: string; value: string }[];
	} | null;
	nonce?: number;
	position?: number;
	confirmations?: number;
	raw_input?: string;
	transaction_types?: string[];
	max_fee_per_gas?: string | null;
	max_priority_fee_per_gas?: string | null;
	base_fee_per_gas?: string | null;
	priority_fee?: string | null;
	transaction_burnt_fee?: string | null;
	result?: string;
	revert_reason?: string | null;
	created_contract?: string | null;
	type?: number;
	fee?: { type: string; value: string };
}

function makeEmptyAddressEntity(hash: string): Transaction['from'] {
	return {
		ens_domain_name: null,
		hash,
		implementations: [],
		is_contract: false,
		is_scam: false,
		is_verified: false,
		metadata: null,
		name: null,
		private_tags: [],
		proxy_type: null,
		public_tags: [],
		reputation: '',
		watchlist_names: []
	};
}

function mapBlockscoutToTransaction(item: BlockscoutTransactionItem): Transaction {
	const fromAddr = item.from?.hash ?? '';
	const toAddr = item.to?.hash ?? '';

	return {
		hash: item.hash,
		from: item.from
			? {
					...makeEmptyAddressEntity(fromAddr),
					...item.from,
					hash: fromAddr
				}
			: makeEmptyAddressEntity(fromAddr),
		to: item.to
			? {
					...makeEmptyAddressEntity(toAddr),
					...item.to,
					hash: toAddr
				}
			: makeEmptyAddressEntity(toAddr),
		value: item.value ?? '0',
		gas_used: item.gas_used ?? '0',
		gas_price: item.gas_price ?? '0',
		gas_limit: item.gas_limit ?? '0',
		block_number: item.block_number ?? 0,
		timestamp: item.timestamp,
		status: item.status ?? 'ok',
		nonce: item.nonce ?? 0,
		position: item.position ?? 0,
		confirmations: item.confirmations ?? 0,
		raw_input: item.raw_input ?? '0x',
		method: item.method ?? null,
		decoded_input: item.decoded_input
			? {
					method_call: item.decoded_input.method_call ?? '',
					method_id: item.decoded_input.method_id ?? '',
					parameters: item.decoded_input.parameters ?? []
				}
			: null,
		transaction_types: item.transaction_types ?? ['contract_call'],
		token_transfers: null,
		max_fee_per_gas: item.max_fee_per_gas ?? null,
		max_priority_fee_per_gas: item.max_priority_fee_per_gas ?? null,
		base_fee_per_gas: item.base_fee_per_gas ?? null,
		priority_fee: item.priority_fee ?? null,
		transaction_burnt_fee: item.transaction_burnt_fee ?? null,
		result: item.result ?? 'success',
		revert_reason: item.revert_reason ?? null,
		created_contract: item.created_contract ?? null,
		is_pending_update: false,
		type: item.type ?? 2,
		has_error_in_internal_transactions: false,
		fee: item.fee ?? { type: 'actual', value: '0' },
		exchange_rate: null,
		historic_exchange_rate: null,
		confirmation_duration: null,
		token_transfers_overflow: null,
		transaction_tag: null,
		authorization_list: [],
		actions: []
	};
}

/**
 * Fetch Arbitrum transactions from Blockscout API for the built-in wallet.
 * The built-in wallet doesn't have an Arbitrum wallet instance in the manager,
 * so we fetch directly from the Blockscout API.
 *
 * @param address - Arbitrum wallet address
 * @returns Array of Transaction objects compatible with processTransactions
 */
export async function fetchArbitrumTransactions(address: string): Promise<Transaction[]> {
	if (!address) return [];

	try {
		const baseUrl = getExplorerApiUrl('arb');
		if (!baseUrl) return [];

		const url = `${baseUrl}/addresses/${address.toLowerCase()}/transactions?sort=block_number&order=desc`;

		const response = await fetch(url, {
			signal: AbortSignal.timeout(10_000),
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			if (import.meta.env.DEV) {
				console.warn(`[fetchArbitrumTransactions] Blockscout returned ${response.status}`);
			}
			return [];
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (!contentType.includes('application/json')) {
			return [];
		}

		const data = await response.json();
		const items: BlockscoutTransactionItem[] = data.items ?? [];

		return items.map(mapBlockscoutToTransaction);
	} catch (error) {
		if (import.meta.env.DEV) {
			console.error('[fetchArbitrumTransactions] Error:', error);
		}
		return [];
	}
}

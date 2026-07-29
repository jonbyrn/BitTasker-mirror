import { detectLightningType, parseLightningInvoice } from './lightningInvoice';
import { validateBitcoinAddress } from './validators';
import { address as liquidAddress } from 'liquidjs-lib';
import {
	isLNURL,
	isLNURLWithdraw,
	extractLNURLUrl,
	fetchLNURLPayDetails,
	fetchLNURLPayInvoice,
	parseLNURLMetadata
} from '$lib/services/lnurl-pay.service';
import {
	isLightningAddress as isLnAddr,
	resolveLightningAddress
} from '$lib/services/lightning-address.service';

export interface ParsedPaymentAddress {
	isValid: boolean;
	address: string;
	network:
		| 'lightning-bitcoin'
		| 'rootstock-bitcoin'
		| 'liquid-bitcoin'
		| 'bitcoin'
		| 'usdt-bsc'
		| 'usdt-ethereum'
		| 'usdt-tron'
		| 'usdt-arbitrum'
		| 'usdt-polygon'
		| 'usdt-optimism'
		| 'usdt-base'
		| 'usdt-avalanche'
		| null;
	amount: number | null; // Amount in sats, null if not specified
	memo: string | null;
	errorMessage?: string; // Optional error message with context
	paymentType?: 'send' | 'withdraw'; // Whether this is a send or withdraw payment
	// LNURL-specific fields (populated after async resolution)
	lnurlCallback?: string;
	lnurlMinSendable?: number; // minimum amount in millisatoshis
	lnurlMaxSendable?: number; // maximum amount in millisatoshis
	lnurlDescription?: string;
	lnurlImage?: string;
}

// Constants
const SATS_PER_BTC = 100_000_000;
const WEI_PER_SAT = 1e10; // 1 BTC = 1e8 sats = 1e18 wei, so 1 sat = 1e10 wei
const MIN_CHAIN_ID = 1;
const MAX_CHAIN_ID = 999999; // Reasonable upper bound for chain IDs

/**
 * Map chain IDs to networks.
 * Covers the ~90% of USDT transaction volume across 9 chains.
 */
const CHAIN_ID_TO_NETWORK: Record<number, string> = {
	// RSK
	30: 'rootstock-bitcoin',
	31: 'rootstock-bitcoin',
	33: 'rootstock-bitcoin',
	// BSC
	56: 'usdt-bsc',
	97: 'usdt-bsc',
	// Ethereum
	1: 'usdt-ethereum',
	11155111: 'usdt-ethereum',
	// Arbitrum
	42161: 'usdt-arbitrum',
	421614: 'usdt-arbitrum',
	// Polygon
	137: 'usdt-polygon',
	80002: 'usdt-polygon',
	// Optimism
	10: 'usdt-optimism',
	11155420: 'usdt-optimism',
	// Base
	8453: 'usdt-base',
	84532: 'usdt-base',
	// Avalanche
	43114: 'usdt-avalanche',
	43113: 'usdt-avalanche'
};

// Compiled regexes (cached for performance)
const ETHEREUM_SCHEME_REGEX = /^(ethereum|bsc|rsk|arbitrum|polygon|optimism|base|avalanche|tron):/i;
const CHAIN_ID_REGEX = /@(\d+)(?:\?|$)/;
const ETHEREUM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const TRON_ADDRESS_REGEX = /^T[A-HJ-NP-Za-km-z1-9]{33}$/;

/**
 * Map scheme prefixes (e.g. "bsc:", "arbitrum:") to network strings.
 */
const SCHEME_TO_NETWORK: Record<string, string> = {
	ethereum: 'usdt-ethereum',
	bsc: 'usdt-bsc',
	rsk: 'rootstock-bitcoin',
	arbitrum: 'usdt-arbitrum',
	polygon: 'usdt-polygon',
	optimism: 'usdt-optimism',
	base: 'usdt-base',
	avalanche: 'usdt-avalanche',
	tron: 'usdt-tron'
};

/**
 * Detect the network from a scheme prefix (e.g. "bsc:0x..." → "usdt-bsc").
 * Returns null if no recognised scheme prefix is present.
 */
function detectSchemeNetwork(lowerTrimmed: string): string | null {
	const match = lowerTrimmed.match(ETHEREUM_SCHEME_REGEX);
	if (!match) return null;
	return SCHEME_TO_NETWORK[match[1].toLowerCase()] ?? null;
}
// Liquid address prefix check (for quick filtering before full validation)
// lq1: Liquid mainnet (Bech32), tex1: Liquid testnet, ert1: Elements regtest, VJL: Legacy P2SH, ex1: Elements
const LIQUID_ADDRESS_PREFIX_REGEX = /^(lq1|tex1|ert1|VJL|ex1)/i;

/**
 * Validate Ethereum address checksum (EIP-55)
 * Note: This is a synchronous placeholder. Full EIP-55 validation requires async crypto operations.
 * For now, we normalize addresses and validate format. Full checksum validation can be added
 * as a separate async utility function if needed.
 */
function isValidEthereumFormat(address: string): boolean {
	if (!ETHEREUM_ADDRESS_REGEX.test(address)) {
		return false;
	}
	// Basic format validation - full EIP-55 checksum validation would require async crypto
	return true;
}

/**
 * Normalize Ethereum address to lowercase for comparison
 * Preserves checksum for display if valid
 */
function normalizeEthereumAddress(address: string): string {
	if (!ETHEREUM_ADDRESS_REGEX.test(address)) {
		return address;
	}
	// Return lowercase for comparison, but validation will check checksum
	return address.toLowerCase();
}

/**
 * Extract chain ID from EIP-681 format address (e.g., ethereum:0x...@56)
 * Only extracts chain IDs that appear after a valid Ethereum address pattern
 * to avoid false positives from email addresses or other @ symbols
 */
function extractChainId(address: string, requireEthereumContext: boolean = true): number | null {
	// EIP-681 format: scheme:address@chainId or address@chainId?params
	// Look for pattern: @ followed by digits, then ? or end of string
	const match = address.match(CHAIN_ID_REGEX);
	if (!match) return null;

	// If we require Ethereum context, verify there's a valid Ethereum address before the @
	if (requireEthereumContext) {
		const beforeAt = address.substring(0, match.index);
		// Check if there's a 0x address pattern before the @
		const addressMatch = beforeAt.match(/0x[a-fA-F0-9]{40}/i);
		if (!addressMatch) {
			// No valid Ethereum address before @, likely not a chain ID
			return null;
		}
	}

	const chainIdStr = match[1];
	const chainId = parseInt(chainIdStr, 10);

	// Validate chain ID is a reasonable number
	if (isNaN(chainId) || chainId < MIN_CHAIN_ID || chainId > MAX_CHAIN_ID) {
		return null;
	}

	return chainId;
}

/**
 * Convert wei to satoshis
 */
function weiToSats(wei: bigint): number {
	return Number(wei / BigInt(WEI_PER_SAT));
}

/**
 * Parse query parameters from a URI string
 * Handles EIP-681 format with @ symbols in the path
 */
function parseQueryParams(uri: string): URLSearchParams {
	const queryIndex = uri.indexOf('?');
	if (queryIndex === -1) {
		return new URLSearchParams();
	}
	const queryString = uri.substring(queryIndex + 1);
	return new URLSearchParams(queryString);
}

/**
 * Extract Ethereum address, chain ID, and query params from input
 * Returns parsed components for further processing
 * Only called for Ethereum-compatible addresses to optimize performance
 */
function extractEthereumComponents(input: string): {
	address: string;
	chainId: number | null;
	queryParams: URLSearchParams;
	hasScheme: boolean;
} {
	const hasScheme = ETHEREUM_SCHEME_REGEX.test(input);

	// Extract chain ID first (before modifying the string)
	// Require Ethereum address context to avoid false positives
	const chainId = extractChainId(input, true);

	// Remove scheme if present
	let addressPart = input;
	if (hasScheme) {
		addressPart = addressPart.replace(ETHEREUM_SCHEME_REGEX, '');
	}

	// Remove chain ID if present (only the first occurrence after address)
	if (chainId !== null) {
		// Replace @chainId pattern, but only if it appears after the address part
		// This prevents removing @ from query params
		addressPart = addressPart.replace(CHAIN_ID_REGEX, '');
	}

	// Extract address (before query params)
	const queryIndex = addressPart.indexOf('?');
	const address = (queryIndex === -1 ? addressPart : addressPart.substring(0, queryIndex)).trim();

	// Parse query params from original input
	const queryParams = parseQueryParams(input);

	return {
		address,
		chainId,
		queryParams,
		hasScheme
	};
}

/**
 * Validate Liquid address using liquidjs-lib
 * Properly validates Bech32 format and checksum for all Liquid address types
 * @param address - The Liquid address to validate
 * @returns true if address is valid, false otherwise
 */
function validateLiquidAddress(address: string): boolean {
	if (!address || typeof address !== 'string') {
		return false;
	}

	// Quick prefix check for performance (before expensive validation)
	if (!LIQUID_ADDRESS_PREFIX_REGEX.test(address)) {
		return false;
	}

	try {
		// Use liquidjs-lib to validate Bech32 format and checksum
		// toOutputScript will throw if address is invalid
		liquidAddress.toOutputScript(address);
		return true;
	} catch {
		// Address is invalid (wrong format, bad checksum, or wrong network)
		return false;
	}
}

/**
 * Parse payment address/invoice and extract network, amount, and memo
 * Supports Lightning invoices, Lightning addresses, RSK addresses, Bitcoin addresses, BSC addresses, Liquid addresses
 * Supports EIP-681 format with chain IDs (e.g., ethereum:0x...@56)
 *
 * @param input - The payment address/invoice string
 * @param sourceHint - Optional source wallet hint ('rootstock-bitcoin' | 'usdt-bsc') to
 *   disambiguate EVM addresses. When a plain 0x... address matches both RSK and BSC,
 *   sourceHint determines the default network. If omitted, defaults to 'rootstock-bitcoin'.
 */
export function parsePaymentAddress(
	input: string,
	sourceHint?: 'rootstock-bitcoin' | 'usdt-bsc' | null
): ParsedPaymentAddress {
	const trimmed = input.trim();

	if (!trimmed) {
		return {
			isValid: false,
			address: '',
			network: null,
			amount: null,
			memo: null
		};
	}

	// 0. Check for LNURL-withdraw (must come before general LNURL check)
	// lnurlw:// is a protocol prefix specifically for withdraw; lnurl1... bech32
	// strings will be distinguished later by fetching the endpoint.
	if (isLNURLWithdraw(trimmed)) {
		return {
			isValid: true,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: null,
			memo: null,
			paymentType: 'withdraw'
		};
	}

	// 1. Check for LNURL-pay (must come before lightning checks)
	// LNURL detection is synchronous; the async resolution happens in the component.
	if (isLNURL(trimmed)) {
		return {
			isValid: true,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: null, // Amount required — user must pick within LNURL min/max
			memo: null, // Will be populated after async resolution
			paymentType: 'send'
		};
	}

	// 2. Check for Lightning invoice/address
	const lightningType = detectLightningType(trimmed);

	// BOLT12 offers/invoices are not yet supported
	if (lightningType === 'bolt12') {
		return {
			isValid: false,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: null,
			memo: null,
			errorMessage: 'bolt12_unsupported'
		};
	}

	if (lightningType === 'bolt11') {
		const parsed = parseLightningInvoice(trimmed);

		// Check for amountless invoice - Boltz submarine swaps require amount in invoice
		// See: https://support.boltz.exchange/hc/center/articles/1745247555
		if (parsed.isValid && !parsed.hasAmount) {
			return {
				isValid: false,
				address: trimmed,
				network: 'lightning-bitcoin',
				amount: null,
				memo: parsed.description,
				errorMessage: 'amountless_invoice' // Special key for i18n lookup
			};
		}

		return {
			isValid: parsed.isValid,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: parsed.amountSats,
			memo: parsed.description // Extract description from Lightning invoice
		};
	}

	if (lightningType === 'lightning-address') {
		return {
			isValid: true,
			address: trimmed,
			network: 'lightning-bitcoin',
			amount: null, // Lightning addresses require amount to be specified
			memo: null,
			paymentType: 'send' // Lightning address resolves to LNURL-pay (send)
		};
	}

	// 2. Check for Bitcoin address (with optional amount/memo)
	// Handle Bitcoin URI format: bitcoin:address?amount=...&label=...&message=...
	const isBitcoinUri = trimmed.startsWith('bitcoin:');
	let btcAddressPart = trimmed;
	let btcQueryIndex = -1;

	if (isBitcoinUri) {
		// Extract address and query from bitcoin:address?params format
		const withoutScheme = trimmed.substring(8); // Remove "bitcoin:"
		btcQueryIndex = withoutScheme.indexOf('?');
		btcAddressPart =
			btcQueryIndex === -1 ? withoutScheme : withoutScheme.substring(0, btcQueryIndex);
	} else {
		// Plain address, check for query params
		btcQueryIndex = trimmed.indexOf('?');
		btcAddressPart = btcQueryIndex === -1 ? trimmed : trimmed.substring(0, btcQueryIndex);
	}

	if (validateBitcoinAddress(btcAddressPart).isValid) {
		if (isBitcoinUri) {
			// Handle Bitcoin URI format: bitcoin:address?amount=...&label=...&message=...
			// Parse query string manually since URL constructor doesn't handle bitcoin: protocol well
			if (btcQueryIndex !== -1) {
				try {
					const queryString = trimmed.substring(trimmed.indexOf('?') + 1);
					const params = new URLSearchParams(queryString);

					let amount: number | null = null;
					const amountParam = params.get('amount');
					if (amountParam) {
						const btc = parseFloat(amountParam);
						if (!isNaN(btc) && btc >= 0) {
							amount = Math.floor(btc * SATS_PER_BTC);
						}
					}

					const memo = params.get('label') || params.get('message') || null;

					return {
						isValid: true,
						address: btcAddressPart,
						network: 'bitcoin',
						amount,
						memo
					};
				} catch {
					// If query parsing fails, return basic Bitcoin address
					return {
						isValid: true,
						address: btcAddressPart,
						network: 'bitcoin',
						amount: null,
						memo: null
					};
				}
			} else {
				// No query params, return basic Bitcoin address
				return {
					isValid: true,
					address: btcAddressPart,
					network: 'bitcoin',
					amount: null,
					memo: null
				};
			}
		} else {
			// Plain Bitcoin address without URI scheme - check for query params manually
			if (btcQueryIndex !== -1) {
				try {
					// Parse query string manually
					const queryString = trimmed.substring(btcQueryIndex + 1);
					const params = new URLSearchParams(queryString);

					let amount: number | null = null;
					const amountParam = params.get('amount');
					if (amountParam) {
						const btc = parseFloat(amountParam);
						if (!isNaN(btc) && btc >= 0) {
							amount = Math.floor(btc * SATS_PER_BTC);
						}
					}

					const memo = params.get('label') || params.get('message') || null;

					return {
						isValid: true,
						address: btcAddressPart,
						network: 'bitcoin',
						amount,
						memo
					};
				} catch {
					// If query parsing fails, return basic Bitcoin address
					return {
						isValid: true,
						address: btcAddressPart,
						network: 'bitcoin',
						amount: null,
						memo: null
					};
				}
			} else {
				// Plain Bitcoin address without any params
				return {
					isValid: true,
					address: btcAddressPart,
					network: 'bitcoin',
					amount: null,
					memo: null
				};
			}
		}
	}

	// 3. Check for Liquid address (supports: liquid:, liquidnetwork:, or plain address)
	// Handle Liquid URI schemes: liquid:address or liquidnetwork:address
	const isLiquidUri = trimmed.startsWith('liquid:') || trimmed.startsWith('liquidnetwork:');
	let liquidAddressPart = trimmed;
	let liquidQueryIndex = -1;

	if (isLiquidUri) {
		// Extract address and query from liquid:address?params or liquidnetwork:address?params format
		const withoutScheme = trimmed.startsWith('liquidnetwork:')
			? trimmed.substring(14) // Remove "liquidnetwork:"
			: trimmed.substring(7); // Remove "liquid:"
		liquidQueryIndex = withoutScheme.indexOf('?');
		liquidAddressPart =
			liquidQueryIndex === -1 ? withoutScheme : withoutScheme.substring(0, liquidQueryIndex);
	} else {
		// Plain address, check for query params
		liquidQueryIndex = trimmed.indexOf('?');
		liquidAddressPart = liquidQueryIndex === -1 ? trimmed : trimmed.substring(0, liquidQueryIndex);
	}

	if (validateLiquidAddress(liquidAddressPart)) {
		// Parse query parameters if present
		if (isLiquidUri || liquidQueryIndex !== -1) {
			try {
				// Extract query string from original input
				const queryString =
					liquidQueryIndex !== -1 ? trimmed.substring(trimmed.indexOf('?') + 1) : '';
				const params = new URLSearchParams(queryString);

				let amount: number | null = null;
				const amountParam = params.get('amount');
				if (amountParam) {
					const btc = parseFloat(amountParam);
					if (!isNaN(btc) && btc >= 0) {
						amount = Math.floor(btc * SATS_PER_BTC);
					}
				}

				const memo = params.get('label') || params.get('message') || null;

				return {
					isValid: true,
					address: liquidAddressPart,
					network: 'liquid-bitcoin',
					amount,
					memo
				};
			} catch {
				// If query parsing fails, return basic Liquid address
				return {
					isValid: true,
					address: liquidAddressPart,
					network: 'liquid-bitcoin',
					amount: null,
					memo: null
				};
			}
		} else {
			// Plain Liquid address without any params
			return {
				isValid: true,
				address: liquidAddressPart,
				network: 'liquid-bitcoin',
				amount: null,
				memo: null
			};
		}
	}

	// 4. Check for Ethereum-compatible addresses (RSK, BSC, + 6 more EVM chains)
	// Only extract components if input looks like Ethereum address (optimization)
	const lowerTrimmed = trimmed.toLowerCase();

	// 5. Check for TRON address (after lowerTrimmed is available; TRON uses T-prefix base58)
	if (lowerTrimmed.startsWith('tron:') || TRON_ADDRESS_REGEX.test(trimmed)) {
		const tronAddr = lowerTrimmed.startsWith('tron:') ? trimmed.slice(5).trim() : trimmed;
		if (TRON_ADDRESS_REGEX.test(tronAddr)) {
			return {
				isValid: true,
				address: tronAddr,
				network: 'usdt-tron',
				amount: null,
				memo: null
			};
		}
		return {
			isValid: false,
			address: trimmed,
			network: null,
			amount: null,
			memo: null
		};
	}
	const looksLikeEthereum =
		lowerTrimmed.startsWith('0x') ||
		/************************************************************************/
		/* Scheme-prefixed addresses: ethereum: bsc: rsk: arbitrum: polygon:    */
		/* optimism: base: avalanche: — all extract to 0x EVM address           */
		/************************************************************************/
		ETHEREUM_SCHEME_REGEX.test(lowerTrimmed) ||
		ETHEREUM_ADDRESS_REGEX.test(trimmed);

	if (!looksLikeEthereum) {
		// Not an Ethereum-compatible or TRON address, return invalid
		return {
			isValid: false,
			address: trimmed,
			network: null,
			amount: null,
			memo: null
		};
	}

	// Detect scheme prefix for default network assignment
	const schemeNetwork = detectSchemeNetwork(lowerTrimmed);

	const ethereumComponents = extractEthereumComponents(trimmed);
	const { address: addressPart, chainId, queryParams } = ethereumComponents;

	// Normalize address for comparison
	const normalizedAddress = normalizeEthereumAddress(addressPart);

	// Validate Ethereum address format and checksum
	const isEthereumAddress = ETHEREUM_ADDRESS_REGEX.test(addressPart);
	if (!isEthereumAddress) {
		return {
			isValid: false,
			address: trimmed,
			network: null,
			amount: null,
			memo: null
		};
	}

	// Validate basic format (checksum validation would require async, so we normalize instead)
	if (!isValidEthereumFormat(addressPart)) {
		return {
			isValid: false,
			address: trimmed,
			network: null,
			amount: null,
			memo: null
		};
	}

	// If chain ID is present and maps to a known network, use it (highest priority)
	if (chainId !== null) {
		const network = CHAIN_ID_TO_NETWORK[chainId];
		if (network) {
			// Valid chain ID for supported network
			let amount: number | null = null;
			const valueParam = queryParams.get('value');
			if (valueParam) {
				try {
					const wei = BigInt(valueParam);
					amount = weiToSats(wei);
				} catch {
					// Invalid value parameter, ignore
				}
			}

			return {
				isValid: true,
				address: normalizedAddress,
				network: network as unknown as
					| 'bitcoin'
					| 'usdt-bsc'
					| 'rootstock-bitcoin'
					| 'usdt-ethereum'
					| 'usdt-arbitrum'
					| 'usdt-polygon'
					| 'lightning-bitcoin'
					| 'liquid-bitcoin'
					| 'usdt-tron'
					| 'usdt-optimism'
					| 'usdt-base'
					| 'usdt-avalanche'
					| null,
				amount,
				memo: queryParams.get('message') || queryParams.get('label') || null
			};
		}
		// Chain ID exists but not in our supported networks - invalid with error message
		return {
			isValid: false,
			address: normalizedAddress || trimmed,
			network: null,
			amount: null,
			memo: null,
			errorMessage: `Chain ID ${chainId} is not supported. Supported chain IDs: ${Object.keys(CHAIN_ID_TO_NETWORK).join(', ')}`
		};
	}

	// 5. Determine network from scheme prefix, source hint, or default
	//    Priority: chainId > scheme prefix > source hint > default (RSK)
	const isRskUri = lowerTrimmed.startsWith('rsk:');
	const isEthereumUri = lowerTrimmed.startsWith('ethereum:');

	// Reject bare `ethereum:` scheme without chain ID (ambiguous — Ethereum mainnet)
	if (isEthereumUri && !chainId) {
		return {
			isValid: false,
			address: normalizedAddress || trimmed,
			network: null,
			amount: null,
			memo: null,
			errorMessage:
				'Ethereum mainnet (chain ID 1) is not supported without explicit chain ID. Use "ethereum:0x...@1" or select chain from the destination picker.'
		};
	}

	// If an explicit scheme prefix is present, use its network (unless chainId overrides)
	let network: string;
	if (schemeNetwork) {
		network = schemeNetwork;
	} else if (!isRskUri && sourceHint === 'usdt-bsc') {
		// No scheme prefix + source is USDT → default to BSC
		network = 'usdt-bsc';
	} else {
		network = 'rootstock-bitcoin';
	}

	let amount: number | null = null;
	const valueParam = queryParams.get('value');
	if (valueParam) {
		try {
			const wei = BigInt(valueParam);
			amount = weiToSats(wei);
		} catch {
			// Invalid value parameter, ignore
		}
	}

	return {
		isValid: true,
		address: normalizedAddress,
		network: network as
			| 'bitcoin'
			| 'usdt-bsc'
			| 'rootstock-bitcoin'
			| 'usdt-ethereum'
			| 'usdt-arbitrum'
			| 'usdt-polygon'
			| 'lightning-bitcoin'
			| 'liquid-bitcoin'
			| 'usdt-tron'
			| 'usdt-optimism'
			| 'usdt-base'
			| 'usdt-avalanche'
			| null,
		amount,
		memo: queryParams.get('message') || queryParams.get('label') || null
	};

	// Invalid address format
	// If we got here but addressPart looks like Ethereum address, normalize it anyway
	if (ETHEREUM_ADDRESS_REGEX.test(addressPart)) {
		return {
			isValid: false,
			address: normalizedAddress || normalizeEthereumAddress(addressPart),
			network: null,
			amount: null,
			memo: null
		};
	}

	return {
		isValid: false,
		address: trimmed,
		network: null,
		amount: null,
		memo: null
	};
}

/**
 * Resolve an LNURL string or Lightning Address to a full ParsedPaymentAddress
 * by fetching its pay request endpoint. This is an async operation that should
 * be called from the component after initial address detection.
 *
 * Handles:
 *   - LNURL bech32 strings (`lnurl1...`)
 *   - LNURL protocol prefixes (`lnurlp://...`)
 *   - Lightning URIs (`lightning:lnurl1...`)
 *   - Direct URLs (`https://...`)
 *   - Lightning Addresses (`user@domain.com`) — resolves via LUD-16
 *
 * @param input - The LNURL string or Lightning Address
 * @returns A fully-resolved ParsedPaymentAddress with LNURL metadata
 */
// Re-export functions needed by components
export { isLNURL, isLNURLWithdraw } from '$lib/services/lnurl-pay.service';
export { isLightningAddress } from '$lib/services/lightning-address.service';

export async function resolveLNURLPaymentAddress(input: string): Promise<ParsedPaymentAddress> {
	// Check if this is a Lightning Address (user@domain)
	if (isLnAddr(input)) {
		const details = await resolveLightningAddress(input);
		const metadata = parseLNURLMetadata(details.metadata);

		return {
			isValid: true,
			address: input,
			network: 'lightning-bitcoin',
			amount: null, // Amount must be chosen by user within min/max
			memo: metadata.description || null,
			paymentType: 'send',
			lnurlCallback: details.callback,
			lnurlMinSendable: details.minSendable,
			lnurlMaxSendable: details.maxSendable,
			lnurlDescription: metadata.description || undefined,
			lnurlImage: metadata.image
		};
	}

	// Standard LNURL resolution (bech32, protocol prefixes, direct URLs)
	const url = extractLNURLUrl(input);
	const details = await fetchLNURLPayDetails(url);
	const metadata = parseLNURLMetadata(details.metadata);

	return {
		isValid: true,
		address: input,
		network: 'lightning-bitcoin',
		amount: null, // Amount must be chosen by user within min/max
		memo: metadata.description || null,
		paymentType: 'send',
		lnurlCallback: details.callback,
		lnurlMinSendable: details.minSendable,
		lnurlMaxSendable: details.maxSendable,
		lnurlDescription: metadata.description || undefined,
		lnurlImage: metadata.image
	};
}

/**
 * Resolve a BOLT11 invoice from an LNURL callback URL.
 * Thin wrapper around fetchLNURLPayInvoice for convenience.
 *
 * @param callbackUrl - The LNURL callback URL
 * @param amountMillisats - The amount in millisatoshis
 * @returns The BOLT11 invoice string
 */
export async function resolveLNURLInvoice(
	callbackUrl: string,
	amountMillisats: number
): Promise<string> {
	return fetchLNURLPayInvoice(callbackUrl, amountMillisats);
}

import { detectLightningType, parseLightningInvoice } from './lightningInvoice';
import { isValidRskAddress } from '@bittasker/wallet-core';
import { validateBitcoinAddress } from './validators';
import { address as liquidAddress } from 'liquidjs-lib';

export interface ParsedPaymentAddress {
	isValid: boolean;
	address: string;
	network: 'lightning-bitcoin' | 'rootstock-bitcoin' | 'liquid-bitcoin' | 'bitcoin' | 'usdt-bsc' | null;
	amount: number | null; // Native-unit amount for the detected rail, null if not specified
	memo: string | null;
	errorMessage?: string; // Optional error message with context
	errorCode?: 'ambiguous-evm-address' | 'unsupported-chain-id' | 'unsupported-scheme';
}

// Constants
const SATS_PER_BTC = 100_000_000;
const WEI_PER_SAT = 1e10; // 1 BTC = 1e8 sats = 1e18 wei, so 1 sat = 1e10 wei
const MIN_CHAIN_ID = 1;
const MAX_CHAIN_ID = 999999; // Reasonable upper bound for chain IDs

/**
 * Map chain IDs to networks
 */
const CHAIN_ID_TO_NETWORK: Record<number, 'rootstock-bitcoin' | 'usdt-bsc'> = {
	30: 'rootstock-bitcoin', // RSK Mainnet
	31: 'rootstock-bitcoin', // RSK Testnet
	33: 'rootstock-bitcoin', // RSK Regtest
	56: 'usdt-bsc', // BSC Mainnet
	97: 'usdt-bsc' // BSC Testnet
};

// Compiled regexes (cached for performance)
const ETHEREUM_SCHEME_REGEX = /^(ethereum|bsc|rsk):/i;
const CHAIN_ID_REGEX = /@(\d+)(?:\?|$)/;
const ETHEREUM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
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

function isMixedCaseAddress(address: string): boolean {
	const hex = address.slice(2);
	return /[a-f]/.test(hex) && /[A-F]/.test(hex);
}

function isValidPlainRskPaymentAddress(address: string): boolean {
	if (!ETHEREUM_ADDRESS_REGEX.test(address) || !isMixedCaseAddress(address)) {
		return false;
	}

	return isValidRskAddress(address, 30) || isValidRskAddress(address, 31);
}

export function qualifyEvmPaymentAddress(
	address: string,
	network: 'rootstock-bitcoin' | 'usdt-bsc'
): string {
	const trimmedAddress = address.trim();
	return network === 'usdt-bsc' ? `bsc:${trimmedAddress}` : `rsk:${trimmedAddress}`;
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

function parseUsdtAmount(amountValue: string | null): number | null {
	if (!amountValue) {
		return null;
	}

	const parsedAmount = Number.parseFloat(amountValue);
	if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
		return null;
	}

	return parsedAmount;
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
	} catch (error) {
		// Address is invalid (wrong format, bad checksum, or wrong network)
		return false;
	}
}

/**
 * Parse payment address/invoice and extract network, amount, and memo
 * Supports Lightning invoices, Lightning addresses, RSK addresses, Bitcoin addresses, BSC addresses, Liquid addresses
 * Supports EIP-681 format with chain IDs (e.g., ethereum:0x...@56)
 */
export function parsePaymentAddress(input: string): ParsedPaymentAddress {
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

	// 1. Check for Lightning invoice/address
	const lightningType = detectLightningType(trimmed);
	if (lightningType === 'bolt11') {
		const parsed = parseLightningInvoice(trimmed);
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
			memo: null
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
		btcAddressPart = btcQueryIndex === -1 ? withoutScheme : withoutScheme.substring(0, btcQueryIndex);
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
				} catch (parseError) {
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
				} catch (error) {
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
		liquidAddressPart = liquidQueryIndex === -1 ? withoutScheme : withoutScheme.substring(0, liquidQueryIndex);
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
				const queryString = liquidQueryIndex !== -1 
					? trimmed.substring(trimmed.indexOf('?') + 1)
					: '';
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
			} catch (error) {
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

	// 4. Check for Ethereum-compatible addresses (RSK, BSC) with chain ID detection
	// Only extract components if input looks like Ethereum address (optimization)
	const lowerTrimmed = trimmed.toLowerCase();
	const looksLikeEthereum = lowerTrimmed.startsWith('0x') || 
	                          lowerTrimmed.startsWith('ethereum:') || 
	                          lowerTrimmed.startsWith('bsc:') || 
	                          lowerTrimmed.startsWith('rsk:') ||
	                          ETHEREUM_ADDRESS_REGEX.test(trimmed);
	
	if (!looksLikeEthereum) {
		// Not an Ethereum-compatible address, return invalid
		return {
			isValid: false,
			address: trimmed,
			network: null,
			amount: null,
			memo: null
		};
	}

	const ethereumComponents = extractEthereumComponents(trimmed);
	const { address: addressPart, chainId, queryParams, hasScheme } = ethereumComponents;
	
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
			const amount =
				network === 'usdt-bsc'
					? parseUsdtAmount(queryParams.get('amount'))
					: (() => {
							const valueParam = queryParams.get('value');
							if (!valueParam) {
								return null;
							}

							try {
								return weiToSats(BigInt(valueParam));
							} catch (error) {
								return null;
							}
						})();

			return {
				isValid: true,
				address: normalizedAddress, // Return normalized address
				network,
				amount,
				memo:
					network === 'usdt-bsc'
						? queryParams.get('memo') || queryParams.get('message') || queryParams.get('label') || null
						: queryParams.get('message') || queryParams.get('label') || null
			};
		}
		// Chain ID exists but not in our supported networks - invalid with error message
		return {
			isValid: false,
			address: normalizedAddress || trimmed,
			network: null,
			amount: null,
			memo: null,
			errorCode: 'unsupported-chain-id',
			errorMessage: `Chain ID ${chainId} is not supported. Supported chain IDs: ${Object.keys(CHAIN_ID_TO_NETWORK).join(', ')}`
		};
	}

	// Plain 0x EVM addresses are ambiguous unless they are checksummed RSK addresses.
	if (!hasScheme && isEthereumAddress) {
		if (isValidPlainRskPaymentAddress(addressPart)) {
			let amount: number | null = null;
			const valueParam = queryParams.get('value');
			if (valueParam) {
				try {
					const wei = BigInt(valueParam);
					amount = weiToSats(wei);
				} catch (error) {
					// Ignore invalid value parameters
				}
			}

			return {
				isValid: true,
				address: normalizedAddress,
				network: 'rootstock-bitcoin',
				amount,
				memo: queryParams.get('message') || null
			};
		}

			return {
				isValid: false,
				address: trimmed,
				network: null,
				amount: null,
				memo: null,
				errorCode: 'ambiguous-evm-address'
			};
		}

	// 5. Check for BSC USDT address (BSC uses Ethereum address format: 0x...)
	// Only treat as BSC if explicitly using bsc: scheme (not ethereum: without chain ID)
	const isBscUri = lowerTrimmed.startsWith('bsc:');
	
	// If it's a BSC URI scheme and valid Ethereum address, treat as BSC
	if (isBscUri && isEthereumAddress) {
		return {
			isValid: true,
			address: normalizedAddress,
			network: 'usdt-bsc',
			amount: parseUsdtAmount(queryParams.get('amount')),
			memo: queryParams.get('memo') || queryParams.get('message') || queryParams.get('label') || null
		};
	}

	// 6. Check for RSK address (with optional query params)
	// Only accept plain raw 0x addresses when they carry a valid RSK checksum.
	const isRskUri = lowerTrimmed.startsWith('rsk:');
	
	// Reject ethereum: scheme without chain ID (ambiguous - could be Ethereum mainnet)
	if (lowerTrimmed.startsWith('ethereum:') && !chainId) {
		return {
			isValid: false,
			address: normalizedAddress || trimmed,
			network: null,
			amount: null,
			memo: null,
			errorCode: 'unsupported-scheme',
			errorMessage: 'Ethereum mainnet (chain ID 1) is not supported. Use bsc: for BSC or rsk: for RSK, or specify chain ID with @'
		};
	}
	
	if (isRskUri || (isEthereumAddress && !hasScheme && isValidPlainRskPaymentAddress(addressPart))) {
		let amount: number | null = null;
		const valueParam = queryParams.get('value');
		if (valueParam) {
			try {
				const wei = BigInt(valueParam);
				amount = weiToSats(wei);
			} catch (error) {
				// Invalid value parameter, ignore
			}
		}

		// Always use normalizedAddress (it's already normalized from addressPart)
		return {
			isValid: true,
			address: normalizedAddress,
			network: 'rootstock-bitcoin',
			amount,
			memo: queryParams.get('message') || null
		};
	}

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

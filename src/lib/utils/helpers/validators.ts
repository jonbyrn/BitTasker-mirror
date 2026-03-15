import { isValidRskAddress, normalizeRskAddress } from '@bittasker/wallet-core';

export interface ValidationResult {
	isValid: boolean;
	error?: string;
}

const ETHEREUM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const SUPPORTED_EVM_CHAIN_IDS = new Set(['30', '31', '56', '97']);


// Import liquidjs-lib for Liquid address validation
import { address as liquidAddress } from 'liquidjs-lib';

export function isValidEmail(email: string): boolean {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

export function validateEmail(email: string): ValidationResult {
	if (!email) {
		return { isValid: false, error: 'Email is required' };
	}
	if (!isValidEmail(email)) {
		return { isValid: false, error: 'Please enter a valid email address' };
	}
	return { isValid: true };
}

export function validateName(name: string): ValidationResult {
	if (!name) {
		return { isValid: false, error: 'Full name is required' };
	}
	if (name.length < 2) {
		return { isValid: false, error: 'Full name must be at least 2 characters long' };
	}
	if (name.length > 100) {
		return { isValid: false, error: 'Full name must not exceed 100 characters' };
	}

	// Split the name into parts
	const nameParts = name.trim().split(/\s+/);
	if (nameParts.length < 2) {
		return { isValid: false, error: 'Please enter your full name (first and last name)' };
	}

	// Check if each part contains only valid characters
	if (!/^[a-zA-Z\s'-]+$/.test(name)) {
		return {
			isValid: false,
			error: 'Name can only contain letters, spaces, hyphens, and apostrophes'
		};
	}

	return { isValid: true };
}

export function validatePassword(password: string): ValidationResult {
	if (!password) {
		return { isValid: false, error: 'Password is required' };
	}

	if (password.length < 12) {
		return { isValid: false, error: 'Password must be at least 12 characters long' };
	}

	return { isValid: true };
}

export function validateNostrPrivateKey(nsec: string): { isValid: boolean; error?: string } {
	// Trim whitespace before validation
	const trimmed = nsec.trim();

	// Check if empty after trimming
	if (!trimmed) {
		return { isValid: false, error: 'Nostr private key cannot be empty' };
	}

	// Check if it's a valid bech32 nsec format
	if (!trimmed.startsWith('nsec1')) {
		return { 
			isValid: false, 
			error: `Nostr private key must start with "nsec1". Found: "${trimmed.substring(0, 10)}..."` 
		};
	}

	// Bech32 nsec keys are typically around 63 characters
	if (trimmed.length < 60 || trimmed.length > 65) {
		return { 
			isValid: false, 
			error: `Invalid Nostr private key length: ${trimmed.length} characters (expected 60-65)` 
		};
	}

	// Only allow valid bech32 characters
	if (!/^nsec1[023456789acdefghjklmnpqrstuvwxyz]+$/i.test(trimmed)) {
		// Find the first invalid character for better error reporting
		const invalidCharMatch = trimmed.match(/[^023456789acdefghjklmnpqrstuvwxyz]/i);
		const invalidChar = invalidCharMatch ? invalidCharMatch[0] : 'unknown';
		return { 
			isValid: false, 
			error: `Invalid character "${invalidChar}" in Nostr private key. Only bech32 characters are allowed.` 
		};
	}

	return { isValid: true };
}

export function validateUsername(username: string): ValidationResult {
	if (!username) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.required' };
	}

	if (username.length < 3) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.too_short' };
	}

	if (username.length > 64) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.too_long' };
	}

	// check for spaces
	if (username.includes(' ')) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.invalid_characters' };
	}

	// Validate allowed characters: letters, numbers, and hyphens only
	// Must start and end with a letter or number (not a hyphen)
	// Cannot contain spaces or other special characters
	const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
	if (!usernameRegex.test(username)) {
		return { isValid: false, error: 'onboarding_auth.form.username_setup.errors.invalid_characters' };
	}

	return { isValid: true };
}

/**
 * Validate RSK address format
 * Checks for valid hex format and proper length (42 characters including 0x prefix)
 */
export function validateRSKAddress(address: string): ValidationResult {
	// Ensure address is a string
	if (typeof address !== 'string') {
		return { isValid: false, error: `Invalid address type: expected string, got ${typeof address}` };
	}

	if (!address) {
		return { isValid: false, error: 'Address is required' };
	}

	// Check if address starts with 0x
	if (!address.startsWith('0x')) {
		return { isValid: false, error: 'Address must start with 0x' };
	}

	// Check if address has correct length (42 characters: 0x + 40 hex chars)
	if (address.length !== 42) {
		return { isValid: false, error: 'Address must be 42 characters long (0x + 40 hex digits)' };
	}

	// Check if address contains only valid hexadecimal characters
	if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
		return { isValid: false, error: 'Address must contain only hexadecimal characters (0-9, a-f)' };
	}

	// Try to normalize the RSK address to validate format
	// normalizeRskAddress will throw if the address is invalid
	try {
		normalizeRskAddress(address);
		return { isValid: true };
	} catch (error) {
		return { isValid: false, error: 'Invalid RSK address checksum' };
	}
}

export function isPlainHexEvmAddress(address: string): boolean {
	return ETHEREUM_ADDRESS_REGEX.test(address.trim());
}

export function isSafeRskPaymentAddress(address: string): boolean {
	if (!isPlainHexEvmAddress(address)) {
		return false;
	}

	const trimmed = address.trim();
	const hasMixedCase = /[a-f]/.test(trimmed.slice(2)) && /[A-F]/.test(trimmed.slice(2));
	if (!hasMixedCase) {
		return false;
	}

	return isValidRskAddress(trimmed, 30) || isValidRskAddress(trimmed, 31);
}

export function validateEvmPaymentIntent(value: string): ValidationResult & {
	network?: 'rootstock-bitcoin' | 'usdt-bsc';
	isAmbiguous?: boolean;
	address?: string;
} {
	const trimmed = value.trim();
	if (!trimmed) {
		return { isValid: false, error: 'Payment address is required' };
	}

	if (/^bsc:0x[0-9a-fA-F]{40}(?:\?|$)/i.test(trimmed)) {
		return { isValid: true, network: 'usdt-bsc' };
	}

	if (/^rsk:0x[0-9a-fA-F]{40}(?:\?|$)/i.test(trimmed)) {
		return { isValid: true, network: 'rootstock-bitcoin' };
	}

	const ethereumIntentMatch = trimmed.match(
		/^ethereum:(0x[0-9a-fA-F]{40})@(\d+)(?:\?|$)/i
	);
	if (ethereumIntentMatch) {
		const [, , chainId] = ethereumIntentMatch;
		if (chainId === '56' || chainId === '97') {
			return { isValid: true, network: 'usdt-bsc' };
		}
		if (chainId === '30' || chainId === '31') {
			return { isValid: true, network: 'rootstock-bitcoin' };
		}

		return {
			isValid: false,
			error: `Unsupported EVM chain ID in payment request: ${chainId}`
		};
	}

	if (/^(bsc|rsk):/i.test(trimmed)) {
		return { isValid: false, error: 'Invalid EVM payment address' };
	}

	if (/^ethereum:/i.test(trimmed)) {
		return {
			isValid: false,
			error: 'Unsupported or missing EVM chain ID in payment request'
		};
	}

	if (isPlainHexEvmAddress(trimmed)) {
		if (isSafeRskPaymentAddress(trimmed)) {
			return {
				isValid: true,
				network: 'rootstock-bitcoin',
				address: normalizeRskAddress(trimmed)
			};
		}

		return {
			isValid: false,
			isAmbiguous: true,
			error:
				'Ambiguous EVM address: the network could not be detected safely. Use an rsk:, bsc:, or ethereum:...@chainId payment request.'
		};
	}

	return { isValid: false, error: 'Invalid EVM payment address' };
}


/**
 * Validate Lightning invoice or Lightning address
 */
export function validateLightningAddress(address: string): ValidationResult {
	if (!address) {
		return { isValid: false, error: 'Lightning address or invoice is required' };
	}

	// Check if it's a Lightning invoice (starts with ln)
	if (address.toLowerCase().startsWith('ln')) {
		// Lightning invoices are typically long strings
		if (address.length < 50) {
			return { isValid: false, error: 'Lightning invoice appears to be too short' };
		}
		return { isValid: true };
	}

	// Check if it's a Lightning address (email format: user@domain)
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (emailRegex.test(address)) {
		return { isValid: true };
	}

	return { isValid: false, error: 'Invalid Lightning address or invoice format' };
}

/**
 * Validate Bitcoin address (basic check for common formats)
 */
export function validateBitcoinAddress(address: string): ValidationResult {
	if (!address) {
		return { isValid: false, error: 'Bitcoin address is required' };
	}

	// Check for common Bitcoin address formats
	// Legacy (P2PKH): starts with 1
	// SegWit (P2SH): starts with 3
	// Native SegWit (Bech32): starts with bc1
	const legacyRegex = /^[1][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
	const segwitP2SHRegex = /^[3][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
	const nativeSegwitRegex = /^bc1[a-z0-9]{39,59}$/;

	if (legacyRegex.test(address) || segwitP2SHRegex.test(address) || nativeSegwitRegex.test(address)) {
		return { isValid: true };
	}

	return { isValid: false, error: 'Invalid Bitcoin address format' };
}

/**
 * Validate Liquid address using liquidjs-lib
 * Properly validates Bech32 format and checksum for all Liquid address types
 */
export function validateLiquidAddress(address: string): ValidationResult {
	if (!address) {
		return { isValid: false, error: 'Liquid address is required' };
	}

	try {
		// Use liquidjs-lib to validate Bech32 format and checksum
		// toOutputScript will throw if address is invalid
		liquidAddress.toOutputScript(address);
		return { isValid: true };
	} catch (error) {
		// Address is invalid (wrong format, bad checksum, or wrong network)
		return {
			isValid: false,
			error: 'Invalid Liquid address format or checksum'
		};
	}
}

/**
 * Validate USDT amount with correct decimal precision (6 decimals for USDT)
 * USDT on BSC uses 6 decimal places (not 18 like most ERC-20 tokens)
 */
export function validateUsdtAmount(amount: string | number): ValidationResult {
	const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

	if (isNaN(numAmount)) {
		return { isValid: false, error: 'Amount must be a valid number' };
	}

	if (numAmount <= 0) {
		return { isValid: false, error: 'Amount must be greater than 0' };
	}

	// Check decimal precision (USDT has 6 decimals: 0.000001 is minimum)
	const decimalPart = amount.toString().split('.')[1];
	if (decimalPart && decimalPart.length > 6) {
		return {
			isValid: false,
			error: 'USDT amount cannot have more than 6 decimal places'
		};
	}

	return { isValid: true };
}

/**
 * Validate and format USDT amount to correct decimal places
 * Converts user-friendly USDT amount to atomic units (multiply by 1,000,000)
 */
export function formatUsdtToAtomicAmount(amount: string | number): string | null {
	const validation = validateUsdtAmount(amount);
	if (!validation.isValid) {
		return null;
	}

	const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
	// USDT has 6 decimals, so multiply by 1,000,000
	const atomicAmount = Math.round(numAmount * 1_000_000);
	return atomicAmount.toString();
}

/**
 * Convert atomic USDT amount back to user-friendly decimal format
 */
export function formatAtomicToUsdtAmount(atomicAmount: string | number | bigint): string {
	const numAmount = typeof atomicAmount === 'bigint'
		? Number(atomicAmount)
		: typeof atomicAmount === 'string'
			? parseInt(atomicAmount, 10)
			: atomicAmount;

	return (numAmount / 1_000_000).toLocaleString('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 6
	});
}

/**
 * Validate BSC address format with proper chain context
 * Accepts: bsc:0x..., ethereum:0x...@56, ethereum:0x...@97, plain 0x... (with checksum)
 */
export function validateBscAddress(address: string): ValidationResult {
	if (!address) {
		return { isValid: false, error: 'Address is required' };
	}

	const trimmed = address.trim();

	// Check for explicit chain qualifiers
	if (trimmed.toLowerCase().startsWith('bsc:')) {
		const hexPart = trimmed.slice(4);
		return validateRSKAddress('0x' + hexPart); // BSC uses same format as RSK
	}

	// Check for ethereum: format with chain ID (56 = BSC mainnet, 97 = BSC testnet)
	const ethereumMatch = trimmed.match(/^ethereum:(0x[0-9a-fA-F]{40})@(56|97)$/i);
	if (ethereumMatch) {
		return { isValid: true };
	}

	// Plain hex address - REJECT without explicit network context
	if (isPlainHexEvmAddress(trimmed)) {
		return {
			isValid: false,
			error: 'Ambiguous BSC address: please use bsc:0x... or ethereum:0x...@chainId format'
		};
	}

	return { isValid: false, error: 'Invalid BSC address format' };
}

/**
 * Map BSC-specific error codes to user-friendly messages
 */
export enum BscDirectSendFailureCode {
	WRONG_CHAIN = 'WRONG_CHAIN',
	SPONSOR_UNAVAILABLE = 'SPONSOR_UNAVAILABLE',
	ROUTER_ALLOWANCE_MISSING = 'ROUTER_ALLOWANCE_MISSING',
	INSUFFICIENT_USDT_BALANCE = 'INSUFFICIENT_USDT_BALANCE',
	TOKEN_CONFIG_MISMATCH = 'TOKEN_CONFIG_MISMATCH',
	POLICY_REJECTED = 'POLICY_REJECTED',
	LEGACY_ONLY = 'LEGACY_ONLY',
	SUBMISSION_UNSUPPORTED = 'SUBMISSION_UNSUPPORTED'
}

export function getBscErrorMessage(code: BscDirectSendFailureCode | string): string {
	const messages: Record<string, string> = {
		[BscDirectSendFailureCode.WRONG_CHAIN]: 'Your wallet is on the wrong network. Switch to BSC Mainnet or Testnet.',
		[BscDirectSendFailureCode.SPONSOR_UNAVAILABLE]: 'Payment sponsorship is currently unavailable. Try again later.',
		[BscDirectSendFailureCode.ROUTER_ALLOWANCE_MISSING]: 'Please approve the USDT router contract first.',
		[BscDirectSendFailureCode.INSUFFICIENT_USDT_BALANCE]: 'Your USDT balance is insufficient for this payment.',
		[BscDirectSendFailureCode.TOKEN_CONFIG_MISMATCH]: 'USDT token configuration mismatch. Please contact support.',
		[BscDirectSendFailureCode.POLICY_REJECTED]: 'This payment cannot be sponsored due to policy restrictions.',
		[BscDirectSendFailureCode.LEGACY_ONLY]: 'This payment method requires manual transaction submission.',
		[BscDirectSendFailureCode.SUBMISSION_UNSUPPORTED]: 'Payment submission is not currently supported.'
	};

	return messages[code] || 'An error occurred with your BSC payment. Please try again.';
}

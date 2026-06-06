/**
 * Wallet-related constants
 * Centralized location for magic numbers and configuration values
 */

// Gas estimation defaults (in RBTC)
export const GAS_ESTIMATES = {
	/** Default gas estimate for native RBTC transfers */
	RBTC_DEFAULT: 0.00003,
	/** Default gas estimate for ERC-20 token transfers */
	ERC20_DEFAULT: 0.0001,
	/** Minimum gas estimate to use as fallback */
	MINIMUM: 0.00001
} as const;

// Timing constants (in milliseconds)
export const TIMING = {
	/** Delay before testing provider validity (allows cleanup to complete) */
	PROVIDER_TEST_DELAY: 150,
	/** Delay after cleanup before reinitialization */
	CLEANUP_DELAY: 100,
	/** Timeout for provider validation test */
	PROVIDER_TEST_TIMEOUT: 2000,
	/** Initial retry delay for token loading */
	RETRY_DELAY_BASE: 300,
	/** Maximum retry attempts for token loading */
	MAX_RETRIES: 5
} as const;

// Balance validation constants
export const BALANCE = {
	/** Tolerance for floating-point balance comparisons */
	FLOATING_POINT_TOLERANCE: 0.00000001,
	/** Percentage of balance to use for gas estimation (to avoid insufficient funds error) */
	ESTIMATION_PERCENTAGE: 0.9
} as const;

// API constants
export const API = {
	/** Timeout for Blockscout API calls (in milliseconds) */
	BLOCKSCOUT_TIMEOUT: 10000,
	/** Cache TTL for token balances (in milliseconds) */
	TOKEN_BALANCE_CACHE_TTL: 60000 // 1 minute
} as const;

// Error messages (for consistent error handling)
export const ERROR_MESSAGES = {
	WALLET_NOT_INITIALIZED: 'Wallet is not initialized',
	PROVIDER_DESTROYED: 'provider destroyed',
	UNSUPPORTED_OPERATION: 'UNSUPPORTED_OPERATION',
	RSK_ADDRESS_NOT_AVAILABLE: 'RSK address not available'
} as const;

// UI constants
export const UI = {
	/** Debounce delay for gas estimation (in milliseconds) */
	GAS_ESTIMATION_DEBOUNCE: 300,
	/** Maximum decimal places for amount input */
	MAX_DECIMAL_PLACES: 18,
	/** Wallet operation toasts stay visible longer than generic app toasts */
	WALLET_TOAST_DURATION_MS: 8000
} as const;

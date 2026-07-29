/**
 * Stablecoin Registry — Phase 1.3
 *
 * Chain-agnostic registry of supported stablecoins and paymaster configurations.
 * Provides chain-level config lookups by chainId, token lookups by symbol + chainId,
 * and utility functions for generating block explorer links.
 *
 * This file is a pure configuration module with no side effects. All data is
 * compile-time static. No async initialization is needed.
 *
 * @see https://docs.candide.dev/wallet/abstractionkit/calibur-account/
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StablecoinToken {
	/** Ticker symbol (e.g. 'USDT', 'USDC') */
	symbol: string;
	/** Human-readable name (e.g. 'Tether USD') */
	name: string;
	/** ERC-20 / BEP-20 contract address (checksummed, lowercased for comparison) */
	address: string;
	/** Token decimals (USDT uses 18 on BSC) */
	decimals: number;
	/** Whether this token can be used for gas fee payment */
	isGasToken: boolean;
	/** Relative path to token logo in /static/logos/ */
	logoUrl: string;
	/** Minimum reserve for future gas (human-readable string, e.g. '0.20'). Warning-only, does not block. */
	minGasReserve: string;
}

export interface RegistryPaymasterConfig {
	/** Paymaster contract address */
	address: string;
	/** EIP-7702 delegation target contract address */
	delegationContract: string;
	/** Primary USDT/BNB price oracle address */
	usdtPriceOracle: string;
	/** Fallback oracle address (optional) */
	fallbackOracle?: string;
	/** Minimum BNB deposit required by the paymaster (wei) */
	minDeposit: bigint;
	/** Paymaster version string (e.g. 'eip7702-v1') */
	version: string;
	/** On-chain enforced maximum gas cost per transaction (in USDT wei) */
	maxGasCapPerTx: bigint;
}

export interface StablecoinNativeCurrency {
	symbol: string;
	name: string;
	decimals: number;
}

export interface StablecoinConfig {
	/** EVM chain ID (e.g. 56 for BSC mainnet) */
	chainId: number;
	/** Human-readable chain name */
	chainName: string;
	/** RPC URLs with failover — first entry is primary, subsequent entries are fallbacks */
	rpcUrls: string[];
	/** Block explorer base URL (e.g. https://bscscan.com) */
	explorerUrl: string;
	/** Block explorer API URL (e.g. https://api.bscscan.com/api) */
	explorerApiUrl: string;
	/** Native chain currency (BNB for BSC) */
	nativeCurrency: StablecoinNativeCurrency;
	/** Supported stablecoin tokens on this chain */
	tokens: StablecoinToken[];
	/** Paymaster configuration for EIP-7702 gas abstraction */
	paymaster: RegistryPaymasterConfig;
	/** Number of block confirmations considered safe */
	confirmations: number;
}

/** Internal map key — stablecoin registry name (e.g. 'bsc-mainnet') */
type NetworkKey = string;

// ---------------------------------------------------------------------------
// Registry Data
// ---------------------------------------------------------------------------

const STABLECOIN_NETWORKS: Record<NetworkKey, StablecoinConfig> = {
	'bsc-mainnet': {
		chainId: 56,
		chainName: 'BNB Smart Chain',
		rpcUrls: [
			'https://bsc-rpc.publicnode.com',
			'https://bsc-dataseed1.binance.org',
			'https://bsc-dataseed2.binance.org'
		],
		explorerUrl: 'https://bscscan.com',
		explorerApiUrl: 'https://api.bscscan.com/api',
		nativeCurrency: { symbol: 'BNB', name: 'BNB', decimals: 18 },
		tokens: [
			{
				symbol: 'USDT',
				name: 'Tether USD',
				address: '0x55d398326f99059ff775485246999027b3197955',
				decimals: 18,
				isGasToken: true,
				logoUrl: '/logos/usdt.svg',
				minGasReserve: '0.20'
			}
		],
		paymaster: {
			address: '<CANDIDE_BSC_PAYMASTER>',
			delegationContract: '<CANDIDE_BSC_DELEGATION>',
			usdtPriceOracle: '<BSC_USDT_ORACLE>',
			fallbackOracle: '<BSC_FALLBACK_ORACLE>',
			minDeposit: 100_000_000_000_000_000n,
			version: 'eip7702-v1',
			maxGasCapPerTx: 500_000_000_000_000_000n
		},
		confirmations: 1
	},
	'bsc-testnet': {
		chainId: 97,
		chainName: 'BNB Smart Chain Testnet',
		rpcUrls: [
			'https://bsc-testnet-rpc.publicnode.com',
			'https://data-seed-prebsc-1-s1.binance.org:8545',
			'https://data-seed-prebsc-2-s1.binance.org:8545'
		],
		explorerUrl: 'https://testnet.bscscan.com',
		explorerApiUrl: 'https://api-testnet.bscscan.com/api',
		nativeCurrency: { symbol: 'tBNB', name: 'Testnet BNB', decimals: 18 },
		tokens: [
			{
				symbol: 'USDT',
				name: 'Tether USD (Test)',
				address: '<BSC_TESTNET_USDT_ADDRESS>',
				decimals: 18,
				isGasToken: true,
				logoUrl: '/logos/usdt.svg',
				minGasReserve: '0.20'
			}
		],
		paymaster: {
			address: '<CANDIDE_BSC_TESTNET_PAYMASTER>',
			delegationContract: '<CANDIDE_BSC_TESTNET_DELEGATION>',
			usdtPriceOracle: '<BSC_TESTNET_USDT_ORACLE>',
			fallbackOracle: '<BSC_TESTNET_FALLBACK_ORACLE>',
			minDeposit: 100_000_000_000_000_000n,
			version: 'eip7702-v1',
			maxGasCapPerTx: 500_000_000_000_000_000n
		},
		confirmations: 1
	}
} as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Reverse-lookup: chainId -> network key. Built once at module load. */
const CHAIN_ID_INDEX: Map<number, NetworkKey> = new Map();

for (const [key, config] of Object.entries(STABLECOIN_NETWORKS)) {
	CHAIN_ID_INDEX.set(config.chainId, key);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up the full chain configuration by EVM chain ID.
 *
 * @param chainId - EVM chain ID (e.g. 56 for BSC mainnet, 97 for BSC testnet)
 * @returns The chain config, or `undefined` if the chain is not in the registry
 */
export function getStablecoinConfig(chainId: number): StablecoinConfig | undefined {
	const key = CHAIN_ID_INDEX.get(chainId);
	if (key === undefined) {
		return undefined;
	}
	return STABLECOIN_NETWORKS[key];
}

/**
 * Look up a token configuration by symbol for a given chain.
 *
 * @param symbol - Token symbol (e.g. 'USDT')
 * @param chainId - EVM chain ID
 * @returns The token config, or `undefined` if the token or chain is not found
 */
export function getTokenConfig(symbol: string, chainId: number): StablecoinToken | undefined {
	const config = getStablecoinConfig(chainId);
	if (config === undefined) {
		return undefined;
	}
	return config.tokens.find(
		(t) => t.symbol.localeCompare(symbol, undefined, { sensitivity: 'base' }) === 0
	);
}

/**
 * Return all chain IDs currently registered in the stablecoin registry.
 */
export function getSupportedChainIds(): number[] {
	return Array.from(CHAIN_ID_INDEX.keys());
}

/**
 * Find the first chain that supports a given token symbol as a gas token.
 *
 * @param symbol - Token symbol (e.g. 'USDT')
 * @returns The chain config, or `undefined` if no supported chain found
 */
export function findChainForGasToken(symbol: string): StablecoinConfig | undefined {
	for (const key of Object.keys(STABLECOIN_NETWORKS)) {
		const config = STABLECOIN_NETWORKS[key];
		const token = config.tokens.find(
			(t) =>
				t.isGasToken && t.symbol.localeCompare(symbol, undefined, { sensitivity: 'base' }) === 0
		);
		if (token !== undefined) {
			return config;
		}
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// Explorer link helpers
// ---------------------------------------------------------------------------

/**
 * Build a block explorer transaction URL for the given chain.
 *
 * @param chainId - EVM chain ID
 * @param txHash - Transaction hash (0x-prefixed hex string)
 * @returns The full explorer URL, or `null` if the chain is not recognised
 *
 * @example
 * ```ts
 * getExplorerTxUrl(56, '0xabc...') // 'https://bscscan.com/tx/0xabc...'
 * ```
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string | null {
	const config = getStablecoinConfig(chainId);
	if (config === undefined) {
		return null;
	}
	return `${config.explorerUrl}/tx/${txHash}`;
}

/**
 * Build a block explorer address URL for the given chain.
 *
 * @param chainId - EVM chain ID
 * @param address - Wallet or contract address (0x-prefixed)
 * @returns The full explorer URL, or `null` if the chain is not recognised
 *
 * @example
 * ```ts
 * getExplorerAddressUrl(56, '0xabc...') // 'https://bscscan.com/address/0xabc...'
 * ```
 */
export function getExplorerAddressUrl(chainId: number, address: string): string | null {
	const config = getStablecoinConfig(chainId);
	if (config === undefined) {
		return null;
	}
	return `${config.explorerUrl}/address/${address}`;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

export interface ConfigValidationResult {
	valid: boolean;
	errors: string[];
}

/**
 * Validate a stablecoin configuration entry for structural correctness.
 * Pure function — no side effects, deterministic output for given input.
 *
 * @param config - The configuration to validate
 * @returns Validation result with list of errors (empty if valid)
 */
export function validateConfig(config: StablecoinConfig): ConfigValidationResult {
	const errors: string[] = [];

	if (config.chainId <= 0) {
		errors.push('chainId must be a positive integer');
	}

	if (config.chainName.length === 0) {
		errors.push('chainName must not be empty');
	}

	if (config.rpcUrls.length === 0) {
		errors.push('at least one RPC URL is required');
	}

	for (const url of config.rpcUrls) {
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
				errors.push(`RPC URL has unsupported protocol: ${url}`);
			}
		} catch {
			errors.push(`RPC URL is not a valid URL: ${url}`);
		}
	}

	if (config.explorerUrl.length === 0) {
		errors.push('explorerUrl must not be empty');
	}

	if (config.tokens.length === 0) {
		errors.push('at least one token configuration is required');
	}

	for (const token of config.tokens) {
		if (token.symbol.length === 0) {
			errors.push('token symbol must not be empty');
		}
		if (token.address.length === 0) {
			errors.push(`token ${token.symbol} address must not be empty`);
		}
		if (token.decimals < 0) {
			errors.push(`token ${token.symbol} decimals must not be negative`);
		}
		if (token.minGasReserve.length === 0) {
			errors.push(`token ${token.symbol} minGasReserve must not be empty`);
		}
	}

	if (config.paymaster.address.length === 0) {
		errors.push('paymaster address must not be empty');
	}

	if (config.paymaster.minDeposit < 0n) {
		errors.push('paymaster minDeposit must not be negative');
	}

	if (config.paymaster.maxGasCapPerTx < 0n) {
		errors.push('paymaster maxGasCapPerTx must not be negative');
	}

	return { valid: errors.length === 0, errors };
}

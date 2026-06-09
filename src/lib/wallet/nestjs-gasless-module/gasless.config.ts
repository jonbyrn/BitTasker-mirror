/**
 * Gasless Module Configuration
 *
 * Defines DI tokens, module options interface, and default configuration
 * for the NestJS gasless relay module.
 *
 * Reference implementation — intended to be ported into the actual NestJS backend.
 */

import type {
	GasConfig,
	FeeTier,
	TokenConfig,
	TreasuryConfig,
	GaslessConfig
} from '../../../types/gasless.types';

// =============================================================================
// DI Tokens
// =============================================================================

/**
 * Injection tokens for the gasless module.
 * Use these with @Inject() to access module-scoped values.
 */
export const GASLESS_CONFIG = Symbol('GASLESS_CONFIG');
export const PAYMASTER_PRIVATE_KEY = Symbol('PAYMASTER_PRIVATE_KEY');
export const BUNDLER_RPC_URL = Symbol('BUNDLER_RPC_URL');
export const ENTRY_POINT_ADDRESS = Symbol('ENTRY_POINT_ADDRESS');
export const PAYMASTER_ADDRESS = Symbol('PAYMASTER_ADDRESS');
export const GAS_TREASURY_ADDRESS = Symbol('GAS_TREASURY_ADDRESS');

// =============================================================================
// Module Options Interface
// =============================================================================

export interface GaslessModuleOptions {
	/** Paymaster signer private key (read from Docker secrets in production) */
	paymasterPrivateKey: string;

	/** Bundler RPC endpoint URL (e.g. Alto on localhost:4337) */
	bundlerRpcUrl: string;

	/** ERC-4337 EntryPoint contract address */
	entryPointAddress: string;

	/** Paymaster contract address */
	paymasterAddress: string;

	/** Treasury address that receives gas fee token payments */
	gasTreasuryAddress: string;

	/** Gas configuration overrides (merged with defaults) */
	gasConfig?: Partial<GasConfig>;

	/** Fee tier overrides (replaces defaults if provided) */
	feeTiers?: FeeTier[];

	/** Allowed token overrides (replaces defaults if provided) */
	allowedTokens?: TokenConfig[];

	/** Treasury split overrides (replaces defaults if provided) */
	treasury?: TreasuryConfig[];

	/** Enable preflight simulation before relay (default: true) */
	enableSimulation?: boolean;

	/** Simulation timeout in milliseconds (default: 5000) */
	simulationTimeoutMs?: number;

	/** Maximum accepted gas limit override */
	maxAcceptedGasLimit?: number;

	/** Deposit monitor: minimum ETH threshold to trigger alert (default: 0.05 ETH) */
	minDepositThreshold?: string;

	// Deposit monitor: cron schedule for deposit checks (default: '0 */6 * * *')
	depositCheckCron?: string;
}

// =============================================================================
// Default Configuration
// =============================================================================

const defaultGasConfig: GasConfig = {
	minGasLimit: 100_000,
	maxGasLimit: 10_000_000,
	defaultGasLimit: 500_000
};

const defaultFeeTiers: FeeTier[] = [
	{
		name: 'standard',
		multiplier: 1.0,
		maxFeePerGas: 100_000_000,
		maxPriorityFeePerGas: 10_000_000
	},
	{
		name: 'fast',
		multiplier: 1.5,
		maxFeePerGas: 200_000_000,
		maxPriorityFeePerGas: 25_000_000
	},
	{
		name: 'urgent',
		multiplier: 2.0,
		maxFeePerGas: 500_000_000,
		maxPriorityFeePerGas: 50_000_000
	}
];

const defaultAllowedTokens: TokenConfig[] = [
	{
		address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC
		symbol: 'USDC',
		decimals: 6,
		allowed: true
	},
	{
		address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT
		symbol: 'USDT',
		decimals: 6,
		allowed: true
	},
	{
		address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // WBTC
		symbol: 'WBTC',
		decimals: 8,
		allowed: true
	},
	{
		address: '0x5979D7b546E38E9Ab80777482e772500Ec1606D5', // WETH
		symbol: 'WETH',
		decimals: 18,
		allowed: true
	}
];

const defaultTreasury: TreasuryConfig[] = [
	{
		address: '0x0000000000000000000000000000000000000001',
		percentage: 0.8
	},
	{
		address: '0x0000000000000000000000000000000000000002',
		percentage: 0.2
	}
];

// =============================================================================
// Resolved Configuration Type
// =============================================================================

export interface ResolvedGaslessConfig extends GaslessConfig {
	paymasterPrivateKey: string;
	bundlerRpcUrl: string;
	entryPointAddress: string;
	paymasterAddress: string;
	gasTreasuryAddress: string;
	enableSimulation: boolean;
	simulationTimeoutMs: number;
	maxAcceptedGasLimit: number;
	minDepositThreshold: string;
	depositCheckCron: string;
}

// =============================================================================
// Configuration Factory
// =============================================================================

/**
 * Build a fully resolved configuration from user options + defaults.
 */
export function buildGaslessConfig(options: GaslessModuleOptions): ResolvedGaslessConfig {
	return {
		gasBounds: { ...defaultGasConfig, ...options.gasConfig },
		feeTiers: options.feeTiers ?? defaultFeeTiers,
		allowedTokens: options.allowedTokens ?? defaultAllowedTokens,
		treasury: options.treasury ?? defaultTreasury,
		paymasterPrivateKey: options.paymasterPrivateKey,
		bundlerRpcUrl: options.bundlerRpcUrl,
		entryPointAddress: options.entryPointAddress,
		paymasterAddress: options.paymasterAddress,
		gasTreasuryAddress: options.gasTreasuryAddress,
		enableSimulation: options.enableSimulation ?? true,
		simulationTimeoutMs: options.simulationTimeoutMs ?? 5000,
		maxAcceptedGasLimit: options.maxAcceptedGasLimit ?? defaultGasConfig.maxGasLimit,
		minDepositThreshold: options.minDepositThreshold ?? '0.05',
		depositCheckCron: options.depositCheckCron ?? '0 */6 * * *'
	};
}

// =============================================================================
// Helper Functions
// =============================================================================

export function getFeeTier(config: ResolvedGaslessConfig, name: string): FeeTier | undefined {
	return config.feeTiers.find((tier) => tier.name === name);
}

export function getToken(config: ResolvedGaslessConfig, symbol: string): TokenConfig | undefined {
	return config.allowedTokens.find((token) => token.symbol === symbol);
}

export function isTokenAllowed(config: ResolvedGaslessConfig, address: string): boolean {
	return config.allowedTokens.some(
		(token) => token.address.toLowerCase() === address.toLowerCase() && token.allowed
	);
}

export function isGasEstimateValid(config: ResolvedGaslessConfig, gasEstimate: number): boolean {
	return gasEstimate >= config.gasBounds.minGasLimit && gasEstimate <= config.gasBounds.maxGasLimit;
}

export function getTotalTreasuryFee(config: ResolvedGaslessConfig): number {
	return config.treasury.reduce((sum, t) => sum + t.percentage, 0);
}

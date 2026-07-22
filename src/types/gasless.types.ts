// =============================================================================
// Gasless Transactions Types — Arbitrum ERC-4337 + EIP-7702
// Source of truth: requirements/gasless-arbitrum-plan.md
// =============================================================================

// ---------------------------------------------------------------------------
// EIP-7702
// ---------------------------------------------------------------------------

/** EIP-7702 authorization tuple sent alongside the UserOp to the bundler. */
export interface EIP7702Auth {
	chainId: string; // hex
	address: string; // delegate contract address
	nonce: string; // hex
	r: string; // hex signature component
	s: string; // hex signature component
	v: string; // hex signature component (yParity + 27)
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Fee tier labels for network fee estimation */
export enum FeeTier {
	Low = 'Low',
	Medium = 'Medium',
	High = 'High',
	VeryHigh = 'VeryHigh'
}

// ---------------------------------------------------------------------------
// ERC-4337 UserOperation
// ---------------------------------------------------------------------------

/**
 * ERC-4337 UserOperation with BigInt financial fields.
 *
 * All gas and fee fields use `bigint` to prevent floating-point precision
 * loss in financial calculations. JSON serialization uses `.toString()`.
 */
export interface UserOperation {
	sender: string;
	nonce: bigint;
	callData: string;
	callGasLimit: bigint;
	verificationGasLimit: bigint;
	preVerificationGas: bigint;
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
	paymasterAndData: string;
	signature: string;
	/** EIP-7702 factory sentinel for first-time delegations */
	factory?: string;
	/** EIP-7702 initialization data */
	factoryData?: string;
	/** Split paymaster fields (Alto v0.7 format for EIP-7702) */
	paymaster?: string;
	paymasterData?: string;
	paymasterVerificationGasLimit?: bigint;
	paymasterPostOpGasLimit?: bigint;
}

/**
 * Serializable UserOperation for JSON transport over HTTP.
 * All bigint fields are represented as `0x`-prefixed hex strings
 * (matching ERC-4337 convention and the backend DTO validation).
 */
export interface SerializableUserOperation {
	sender: string;
	nonce: string;
	callData: string;
	callGasLimit: string;
	verificationGasLimit: string;
	preVerificationGas: string;
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;
	signature: string;
	/** EIP-7702 factory sentinel for first-time delegations */
	factory?: string;
	/** EIP-7702 initialization data (delegate contract address) */
	factoryData?: string;
	/** Packed paymasterAndData (legacy format — not used for EIP-7702) */
	paymasterAndData?: string;
	/** Split paymaster fields (Alto v0.7 format for EIP-7702) */
	paymaster?: string;
	paymasterData?: string;
	paymasterVerificationGasLimit?: string;
	paymasterPostOpGasLimit?: string;
}

// ---------------------------------------------------------------------------
// Fee estimation
// ---------------------------------------------------------------------------

/** Gas estimation result from Alto bundler. */
export interface GasEstimate {
	preVerificationGas: bigint;
	verificationGasLimit: bigint;
	callGasLimit: bigint;
	totalGas: bigint;
}

/** Fee tier definition with gas bounds and USD cost. */
export interface FeeTierDef {
	label: string;
	minGas: bigint;
	maxGas: bigint;
	feeUSD: number;
}

/** Fee estimate returned to client. */
export interface FeeEstimate {
	feeBuffer: string; // Fee buffer in token's smallest unit (string for bigint)
	feeCostUSD: number; // Fee cost in USD
	feeTier: string; // Fee tier label (Low/Medium/High)
	totalWithBuffer: string; // amount + feeBuffer (string for bigint)
	/** Estimated gas limits from Alto bundler (decimal strings). */
	estimatedGas?: {
		callGasLimit: string;
		verificationGasLimit: string;
		preVerificationGas: string;
	};
}

/** Gas price result from bundler. */
export interface GasPrice {
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
}

// ---------------------------------------------------------------------------
// Token configuration
// ---------------------------------------------------------------------------

/** Token information for Arbitrum One. */
export interface TokenInfo {
	address: string;
	symbol: string;
	decimals: number;
	chainId: number;
}

/** Gas bounds configuration. */
export interface GasBounds {
	maxCallGas: bigint;
	maxVerificationGas: bigint;
	maxPreVerificationGas: bigint;
	maxFeePerGas: bigint;
	maxPriorityFeePerGas: bigint;
	maxTotalGas: bigint;
}

/** Fee buffer bounds per token. */
export interface FeeBufferBounds {
	min: bigint;
	max: bigint;
}

// ---------------------------------------------------------------------------
// Chainlink Oracle
// ---------------------------------------------------------------------------

/** Chainlink price feed data. */
export interface ChainlinkRoundData {
	answer: bigint;
	updatedAt: bigint;
	roundId: bigint;
}

/** Oracle price result. */
export interface OraclePrice {
	priceUSD: bigint; // in 18 decimals
	updatedAt: number; // unix timestamp
	stale: boolean;
}

// ---------------------------------------------------------------------------
// Deposit monitoring
// ---------------------------------------------------------------------------

/** Paymaster deposit health status. */
export interface DepositHealth {
	balance: bigint; // in wei
	healthy: boolean;
	warning: boolean;
	paused: boolean;
}

// ---------------------------------------------------------------------------
// DTOs (Data Transfer Objects)
// ---------------------------------------------------------------------------

/** Request body for POST /gasless/relay */
export interface RelayUserOpDto {
	sender: string;
	userOp: SerializableUserOperation;
	/** EIP-7702 authorization, required for first-time delegations */
	eip7702Auth?: EIP7702Auth;
}

/** Request body for POST /gasless/estimate */
export interface EstimateDto {
	token: string;
	amount: string;
	recipient: string;
	calls?: Array<{
		to: string;
		data: string;
		value?: string;
	}>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** JWT payload from auth guard. */
export interface JwtPayload {
	id: string;
	walletAddress: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Complete gasless system configuration. */
export interface GaslessConfig {
	tokens: TokenInfo[];
	gasBounds: GasBounds;
	feeTiers: FeeTierDef[];
	feeBufferBounds: Record<string, FeeBufferBounds>;
	treasury: string;
	entryPointAddress: string;
	chainId: bigint;
	altoUrls: string[];
	chainlinkFeeds: {
		ethUsd: string;
		btcUsd: string;
	};
}

// ---------------------------------------------------------------------------
// ABI fragments (minimal, for decoding only)
// ---------------------------------------------------------------------------

/** Minimal ABI for SimpleAccount.executeBatch */
export const SIMPLE_ACCOUNT_ABI = [
	{
		type: 'function' as const,
		name: 'executeBatch',
		inputs: [
			{
				name: 'calls',
				type: 'tuple[]',
				components: [
					{ name: 'to', type: 'address' },
					{ name: 'value', type: 'uint256' },
					{ name: 'data', type: 'bytes' }
				]
			}
		]
	}
] as const;

/** Minimal ABI for ERC20.transfer */
export const ERC20_ABI = [
	{
		type: 'function' as const,
		name: 'transfer',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' }
		],
		outputs: [{ name: '', type: 'bool' }],
		stateMutability: 'nonpayable'
	}
] as const;

/** Chainlink Aggregator V3 minimal ABI */
export const CHAINLINK_ABI = [
	{
		type: 'function' as const,
		name: 'latestRoundData',
		inputs: [],
		outputs: [
			{ name: 'roundId', type: 'uint80' },
			{ name: 'answer', type: 'int256' },
			{ name: 'startedAt', type: 'uint256' },
			{ name: 'updatedAt', type: 'uint256' },
			{ name: 'answeredInRound', type: 'uint80' }
		],
		stateMutability: 'view'
	}
] as const;

/** EntryPoint v0.8 ABI (minimal) */
export const ENTRY_POINT_ABI = [
	{
		type: 'function' as const,
		name: 'balanceOf',
		inputs: [{ type: 'address', name: 'account' }],
		outputs: [{ type: 'uint256' }],
		stateMutability: 'view'
	},
	{
		type: 'function' as const,
		name: 'simulateValidation',
		inputs: [
			{
				type: 'tuple',
				name: 'userOp',
				components: [
					{ type: 'address', name: 'sender' },
					{ type: 'uint256', name: 'nonce' },
					{ type: 'bytes', name: 'callData' },
					{ type: 'uint256', name: 'callGasLimit' },
					{ type: 'uint256', name: 'verificationGasLimit' },
					{ type: 'uint256', name: 'preVerificationGas' },
					{ type: 'uint256', name: 'maxFeePerGas' },
					{ type: 'uint256', name: 'maxPriorityFeePerGas' },
					{ type: 'bytes', name: 'paymasterAndData' },
					{ type: 'bytes', name: 'signature' }
				]
			}
		],
		outputs: [],
		stateMutability: 'nonpayable'
	}
] as const;

// ---------------------------------------------------------------------------
// Constants — re-exported from gasless.config.ts (single source of truth)
// ---------------------------------------------------------------------------
// All constants are defined in src/lib/wallet/gasless.config.ts.
// Import them from there to avoid duplication and value drift.
export {
	ALLOWED_FEE_TOKENS,
	GAS_TREASURY,
	FEE_BUFFER_MIN,
	FEE_BUFFER_MAX,
	GAS_BOUNDS,
	FEE_TIERS
} from '$lib/wallet/gasless.config';

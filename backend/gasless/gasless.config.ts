// Gasless Configuration for NestJS Backend
// Single source of truth for all gasless constants

export const ARBITRUM_CHAIN_ID = 42161;
export const ENTRY_POINT_ADDRESS = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' as const;
export const SIMPLE_7702_ACCOUNT_IMPL = '0xe6Cae83BdE06E4c305530e199D7217f42808555B' as const;

// Token Addresses
export const USDT0_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' as const;
export const WBTC_ADDRESS = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' as const;
export const TBTC_ADDRESS = '0x6c84a8f1c29108f47a79964b5fe888d4f4d0de40' as const;

// Token Info
export interface TokenInfo {
	address: string;
	symbol: string;
	decimals: number;
	chainId: number;
}

export const TOKENS: readonly TokenInfo[] = [
	{ address: USDT0_ADDRESS, symbol: 'USDT0', decimals: 18, chainId: ARBITRUM_CHAIN_ID },
	{ address: WBTC_ADDRESS, symbol: 'WBTC', decimals: 8, chainId: ARBITRUM_CHAIN_ID },
	{ address: TBTC_ADDRESS, symbol: 'TBTC', decimals: 18, chainId: ARBITRUM_CHAIN_ID }
];

export const ALLOWED_FEE_TOKENS: readonly string[] = TOKENS.map((t) => t.address.toLowerCase());

// Gas Bounds (from plan Section 4.9)
export const GAS_BOUNDS = {
	MAX_CALL_GAS: 5_000_000n,
	MAX_VERIFICATION_GAS: 1_000_000n,
	MAX_PRE_VERIFICATION_GAS: 400_000n, // EIP-7702: bundler base ~300K + 25K delegation overhead
	MAX_FEE_PER_GAS: 1_000_000_000n, // 1 gwei
	MAX_PRIORITY_FEE_PER_GAS: 100_000_000n, // 0.1 gwei
	MAX_TOTAL_GAS: 6_400_000n // Must accommodate 5M + 1M + 400K individual maxes
};

// Fee Tiers (from plan Section 5.2)
export interface FeeTierDef {
	label: string;
	minGas: bigint;
	maxGas: bigint;
	feeUSD: number;
}

export const FEE_TIERS: readonly FeeTierDef[] = [
	{ label: 'Low', minGas: 0n, maxGas: 200_000n, feeUSD: 0.01 },
	{ label: 'Medium', minGas: 200_001n, maxGas: 500_000n, feeUSD: 0.03 },
	{ label: 'High', minGas: 500_001n, maxGas: 1_000_000n, feeUSD: 0.05 },
	{ label: 'Very High', minGas: 1_000_001n, maxGas: 6_400_000n, feeUSD: 0.1 }
];

// Fee Buffer Bounds (per token)
export const FEE_BUFFER_MIN: Record<string, bigint> = {
	[USDT0_ADDRESS.toLowerCase()]: 10_000_000_000_000_000n, // 0.01 USDT0
	[WBTC_ADDRESS.toLowerCase()]: 16n, // 16 satoshis
	[TBTC_ADDRESS.toLowerCase()]: 10_000_000_000_000_000n // 0.01 tBTC
};

export const FEE_BUFFER_MAX: Record<string, bigint> = {
	[USDT0_ADDRESS.toLowerCase()]: 150_000_000_000_000_000n, // 0.15 USDT0
	[WBTC_ADDRESS.toLowerCase()]: 230n, // 230 satoshis
	[TBTC_ADDRESS.toLowerCase()]: 150_000_000_000_000_000n // 0.15 tBTC
};

// Environment variables with validation
export const GAS_TREASURY = process.env['GAS_TREASURY'] ?? '';
if (!GAS_TREASURY) {
	console.warn('[gasless] GAS_TREASURY environment variable is not set. Fee collection will fail.');
}

export const ALTO_URLS: readonly string[] = [
	process.env['ALTO_URL_1'] ?? 'http://alto-1:3000',
	process.env['ALTO_URL_2'] ?? 'http://alto-2:3000'
];

export const ARBITRUM_RPC_URL = process.env['ARBITRUM_RPC_URL'] ?? '';
if (!ARBITRUM_RPC_URL) {
	console.warn('[gasless] ARBITRUM_RPC_URL environment variable is not set. RPC calls will fail.');
}

export const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:4000';

// Chainlink Price Feeds (Arbitrum One)
export const ETH_USD_FEED = '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612' as const;
export const BTC_USD_FEED = '0x6ce185860a4963106506C203335A2910413708e9' as const;
export const MAX_ORACLE_STALENESS = 300; // 5 minutes in seconds

// Paymaster signer key
export const PAYMASTER_SIGNER_KEY_FILE =
	process.env['PAYMASTER_SIGNER_KEY_FILE'] ?? '/run/secrets/paymaster_signer_key';

// Helper: Get fee tier from estimated gas
export function getNetworkFeeTier(estimatedGas: bigint): { feeUSD: number; label: string } {
	for (const tier of FEE_TIERS) {
		if (estimatedGas >= tier.minGas && estimatedGas <= tier.maxGas) {
			return { feeUSD: tier.feeUSD, label: tier.label };
		}
	}
	throw new Error('Network fee too high — operation too complex');
}

// Helper: Get token info by address
export function getTokenInfo(tokenAddress: string): TokenInfo {
	const token = TOKENS.find((t) => t.address.toLowerCase() === tokenAddress.toLowerCase());
	if (!token) throw new Error(`Unknown token: ${tokenAddress}`);
	return token;
}

// Helper: Convert USD fee to token amount (BigInt arithmetic)
export function convertToTokenFee(
	feeUSD: number,
	tokenAddress: string,
	tokenPriceUSD: bigint
): bigint {
	const token = getTokenInfo(tokenAddress);

	// All BigInt arithmetic — no floating point
	const feeUSDWei = BigInt(Math.round(feeUSD * 1e18));
	const tokenAmount = (feeUSDWei * BigInt(10 ** token.decimals)) / tokenPriceUSD;
	return tokenAmount + 1n; // Round UP (favor treasury)
}

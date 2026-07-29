/**
 * Verified Token Configuration
 *
 * Tier 2 tokens: USDT/USDC stablecoins on supported EVM chains.
 * Displayed in italic below the Tier 1 core assets when balance > 0.
 * NOT included in the total wallet USD balance.
 *
 * Contract addresses from official Tether/Circle deployments.
 * @see https://tether.to/en/transparency
 * @see https://developers.circle.com/stablecoins/docs/evm-smart-contracts
 */

export interface VerifiedToken {
	/** Contract address (lowercased for lookup) */
	address: string;
	/** Display symbol */
	symbol: string;
	/** Display name */
	name: string;
	/** Decimals for raw → human conversion */
	decimals: number;
}

/** Chain ID → verified tokens on that chain */
export const VERIFIED_TOKENS: Record<number, VerifiedToken[]> = {
	1: [
		// Ethereum
		{
			address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
			symbol: 'USDT',
			name: 'Tether USD',
			decimals: 6
		},
		{
			address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6
		}
	],
	10: [
		// Optimism
		{
			address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
			symbol: 'USDT',
			name: 'Tether USD',
			decimals: 6
		},
		{
			address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6
		}
	],
	30: [
		// Rootstock — DOC stablecoin + USDT0 (via LayerZero OFT)
		{
			address: '0xe700691da7b9851f2f35f8b8182c69c53ccad9db',
			symbol: 'DOC',
			name: 'Dollar on Chain',
			decimals: 18
		},
		{
			address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
			symbol: 'USDT0',
			name: 'USDT0 on Rootstock',
			decimals: 6
		}
	],
	56: [
		// BSC
		{
			address: '0x55d398326f99059fF775485246999027B3197955',
			symbol: 'USDT',
			name: 'Tether USD',
			decimals: 18
		},
		{
			address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 18
		}
	],
	137: [
		// Polygon
		{
			address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
			symbol: 'USDT',
			name: 'Tether USD',
			decimals: 6
		},
		{
			address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6
		}
	],
	250: [
		// Fantom
		{
			address: '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6
		}
	],
	100: [
		// Gnosis
		{
			address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6
		}
	],
	42220: [
		// Celo
		{
			address: '0x617f3112bf5397D0467D315cC709EF968D9ba546',
			symbol: 'USDT',
			name: 'Tether USD (wormhole)',
			decimals: 6
		},
		{
			address: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
			symbol: 'USDC',
			name: 'USD Coin (wormhole)',
			decimals: 6
		}
	],
	42161: [
		// Arbitrum — USDT already tracked as usdt0-arb in Tier 1
		{
			address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6
		}
	],
	43114: [
		// Avalanche
		{
			address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
			symbol: 'USDT',
			name: 'Tether USD',
			decimals: 6
		},
		{
			address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6
		}
	],
	8453: [
		// Base
		{
			address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
			symbol: 'USDC',
			name: 'USD Coin',
			decimals: 6
		}
	]
};

/** Chain ID → display label for the chain in the UI */
export const CHAIN_LABELS: Record<number, string> = {
	1: 'Ethereum',
	10: 'Optimism',
	30: 'Rootstock',
	56: 'Binance',
	137: 'Polygon',
	250: 'Fantom',
	100: 'Gnosis',
	42220: 'Celo',
	42161: 'Arbitrum',
	43114: 'Avalanche',
	8453: 'Base'
};

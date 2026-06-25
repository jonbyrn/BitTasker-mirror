/**
 * Route Engine — Token Registry
 *
 * All token definitions, source-wallet → token mappings, and destination
 * resolution logic. Pure data + pure functions — no side effects, no network.
 */

import type { Token, SourceWallet, Destination } from './types';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('route-engine:tokens');

// ---------------------------------------------------------------------------
// Token Definitions
// ---------------------------------------------------------------------------

/** All tokens in the system. Pure data, no logic. */
export const TOKENS: Record<string, Token> = {
	rbtc: {
		key: 'rbtc',
		symbol: 'RBTC',
		address: '0x0000000000000000000000000000000000000000',
		chain: 'rsk',
		chainId: 30,
		decimals: 18,
		native: true
	},
	'usdt0-rsk': {
		key: 'usdt0-rsk',
		symbol: 'USDT0',
		address: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
		chain: 'rsk',
		chainId: 30,
		decimals: 6,
		native: false
	},
	'doc-rsk': {
		key: 'doc-rsk',
		symbol: 'DOC',
		address: '0xe700691d713e8b95c02b126164164732f777734f',
		chain: 'rsk',
		chainId: 30,
		decimals: 18,
		native: false
	},
	'usdt-bsc': {
		key: 'usdt-bsc',
		symbol: 'USDT',
		address: '0x55d398326f99059fF775485246999027B3197955',
		chain: 'bsc',
		chainId: 56,
		decimals: 18,
		native: false
	},
	'usdt0-arb': {
		key: 'usdt0-arb',
		symbol: 'USDT0',
		address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		chain: 'arbitrum',
		chainId: 42161,
		decimals: 6,
		native: false
	},
	'wbtc-arb': {
		key: 'wbtc-arb',
		symbol: 'WBTC',
		address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		chain: 'arbitrum',
		chainId: 42161,
		decimals: 8,
		native: false
	},
	'tbtc-arb': {
		key: 'tbtc-arb',
		symbol: 'tBTC',
		address: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40',
		chain: 'arbitrum',
		chainId: 42161,
		decimals: 18,
		native: false
	},
	btc: {
		key: 'btc',
		symbol: 'BTC',
		address: '',
		chain: 'bitcoin',
		chainId: -1,
		decimals: 8,
		native: true
	},
	'btc-ln': {
		key: 'btc-ln',
		symbol: 'BTC',
		address: '',
		chain: 'lightning',
		chainId: -2,
		decimals: 8,
		native: true
	}
};

// ---------------------------------------------------------------------------
// Chain ID Sets
// ---------------------------------------------------------------------------

export const RSK_CHAIN_IDS = new Set([30, 31, 33]);
export const BSC_CHAIN_IDS = new Set([56, 97]);
export const ARB_CHAIN_IDS = new Set([42161, 421614]);

const ETH_CHAIN_IDS = new Set([1, 11155111]);
const POLY_CHAIN_IDS = new Set([137, 80002]);
const OP_CHAIN_IDS = new Set([10, 11155420]);
const BASE_CHAIN_IDS = new Set([8453, 84532]);
const AVAX_CHAIN_IDS = new Set([43114, 43113]);

/** All non-BSC, non-RSK, non-ARB EVM chain ID sets (for cross-chain routing). */
const ALL_CROSS_CHAIN_IDS = new Set([
	...ETH_CHAIN_IDS,
	...POLY_CHAIN_IDS,
	...OP_CHAIN_IDS,
	...BASE_CHAIN_IDS,
	...AVAX_CHAIN_IDS
]);

function isCrossChainEVM(chainId: number): boolean {
	return ALL_CROSS_CHAIN_IDS.has(chainId);
}

// ---------------------------------------------------------------------------
// Source Wallet → Available Tokens
// ---------------------------------------------------------------------------

/**
 * Maps SourceWallet to the list of token keys that wallet can spend.
 * Matches the existing `SourceWallet` type from route-resolver.ts.
 */
export const SOURCE_WALLET_TOKENS: Record<SourceWallet, string[]> = {
	rbtc: ['rbtc'],
	'usdt-bsc': ['usdt-bsc'],
	'usdt0-rsk': ['usdt0-rsk'],
	'usdt0-arb': ['usdt0-arb'],
	'doc-rsk': ['doc-rsk'],
	'btc-onchain': ['btc'],
	'wbtc-arb': ['wbtc-arb'],
	'tbtc-arb': ['tbtc-arb']
};

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Look up a token by its unique key.
 * Returns undefined if the key does not exist in the registry.
 */
export function getTokenByKey(key: string): Token | undefined {
	return TOKENS[key];
}

/**
 * Resolve a SourceWallet to its primary Token.
 * Returns the first token mapped to this wallet, or undefined if unmapped.
 */
export function resolveTokenKey(source: SourceWallet): Token | undefined {
	const keys = SOURCE_WALLET_TOKENS[source];
	return keys?.[0] ? TOKENS[keys[0]] : undefined;
}

// ---------------------------------------------------------------------------
// Destination Resolution
// ---------------------------------------------------------------------------

/**
 * Convert a Destination to target Token(s).
 *
 * For address destinations: resolve by chainId + optional asset hint.
 * For invoice destinations: resolve to btc (onchain) or btc-ln (lightning).
 *
 * Returns an array because some destinations could match multiple tokens
 * (e.g. chainId 42161 could be USDT0, WBTC, or tBTC).
 */
export function resolveDestinationTokens(destination: Destination): Token[] {
	if (destination.type === 'invoice') {
		if (destination.network === 'lightning') return [TOKENS['btc-ln']];
		if (destination.network === 'onchain') return [TOKENS['btc']];
		return [];
	}

	// Address destination — match by chainId
	const { chainId } = destination;
	const asset = destination.asset?.toUpperCase();

	// Specific asset hint takes priority
	if (asset === 'WBTC' && chainId === 42161) return [TOKENS['wbtc-arb']];
	if (asset === 'TBTC' && chainId === 42161) return [TOKENS['tbtc-arb']];
	if (asset === 'USDT0' && chainId === 42161) return [TOKENS['usdt0-arb']];

	// Chain-based defaults
	if (RSK_CHAIN_IDS.has(chainId)) return [TOKENS['rbtc']];
	if (BSC_CHAIN_IDS.has(chainId)) return [TOKENS['usdt-bsc']];
	if (ARB_CHAIN_IDS.has(chainId)) return [TOKENS['usdt0-arb']];
	if (chainId === 0) return [TOKENS['usdt-bsc']]; // TRON pseudo

	// Cross-chain EVM defaults to USDT on destination
	if (isCrossChainEVM(chainId)) return [TOKENS['usdt-bsc']]; // Changelly/LI.FI will resolve

	debug.warn('No token match for destination chainId=%d asset=%s', chainId, asset);
	return [];
}

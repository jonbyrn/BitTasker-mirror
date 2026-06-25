/**
 * Token Registry — Unit Tests
 *
 * Tests all token definitions, source-wallet mappings, and destination
 * resolution logic. Pure data + pure functions — no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import {
	TOKENS,
	SOURCE_WALLET_TOKENS,
	RSK_CHAIN_IDS,
	BSC_CHAIN_IDS,
	ARB_CHAIN_IDS,
	getTokenByKey,
	resolveTokenKey,
	resolveDestinationTokens
} from '$lib/services/route-engine/token-registry';
import type { SourceWallet, Destination } from '$lib/services/route-resolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAddressDest(chainId: number, asset?: string): Destination {
	return {
		type: 'address',
		chainId,
		address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
		...(asset ? { asset } : {})
	};
}

function makeInvoiceDest(network: 'lightning' | 'onchain'): Destination {
	return { type: 'invoice', network, invoice: 'lnbc1...' };
}

// ---------------------------------------------------------------------------
// TOKENS definitions
// ---------------------------------------------------------------------------

describe('TOKENS', () => {
	it('every token has a non-empty key', () => {
		for (const [key, token] of Object.entries(TOKENS)) {
			expect(token.key).toBe(key);
			expect(token.key.length).toBeGreaterThan(0);
		}
	});

	it('every token has valid decimals (0-18)', () => {
		for (const token of Object.values(TOKENS)) {
			expect(token.decimals).toBeGreaterThanOrEqual(0);
			expect(token.decimals).toBeLessThanOrEqual(18);
		}
	});

	it('every token has a defined chain string', () => {
		for (const token of Object.values(TOKENS)) {
			expect(typeof token.chain).toBe('string');
			expect(token.chain.length).toBeGreaterThan(0);
		}
	});

	it('ERC-20 tokens have 0x addresses; native tokens may have empty', () => {
		for (const token of Object.values(TOKENS)) {
			if (token.native && (token.chain === 'bitcoin' || token.chain === 'lightning')) {
				expect(token.address).toBe('');
			} else if (!token.native) {
				expect(token.address).toMatch(/^0x/);
			}
		}
	});

	it('contains expected token keys', () => {
		const expectedKeys = [
			'rbtc',
			'usdt0-rsk',
			'doc-rsk',
			'usdt-bsc',
			'usdt0-arb',
			'wbtc-arb',
			'tbtc-arb',
			'btc',
			'btc-ln'
		];
		for (const key of expectedKeys) {
			expect(TOKENS[key]).toBeDefined();
			expect(TOKENS[key].key).toBe(key);
		}
	});
});

// ---------------------------------------------------------------------------
// resolveTokenKey
// ---------------------------------------------------------------------------

describe('resolveTokenKey', () => {
	const allSourceWallets: SourceWallet[] = [
		'rbtc',
		'usdt-bsc',
		'usdt0-rsk',
		'usdt0-arb',
		'doc-rsk',
		'btc-onchain',
		'wbtc-arb',
		'tbtc-arb'
	];

	for (const wallet of allSourceWallets) {
		it(`resolves SourceWallet '${wallet}' to a valid Token`, () => {
			const token = resolveTokenKey(wallet);
			expect(token).toBeDefined();
			expect(token!.key).toBe(SOURCE_WALLET_TOKENS[wallet][0]);
		});
	}

	it('rbtc wallet maps to rbtc token', () => {
		expect(resolveTokenKey('rbtc')!.key).toBe('rbtc');
		expect(resolveTokenKey('rbtc')!.chain).toBe('rsk');
	});

	it('btc-onchain wallet maps to btc token', () => {
		expect(resolveTokenKey('btc-onchain')!.key).toBe('btc');
		expect(resolveTokenKey('btc-onchain')!.chain).toBe('bitcoin');
	});
});

// ---------------------------------------------------------------------------
// resolveDestinationTokens
// ---------------------------------------------------------------------------

describe('resolveDestinationTokens', () => {
	describe('invoice destinations', () => {
		it('lightning invoice → btc-ln', () => {
			const tokens = resolveDestinationTokens(makeInvoiceDest('lightning'));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('btc-ln');
			expect(tokens[0].chain).toBe('lightning');
		});

		it('onchain invoice → btc', () => {
			const tokens = resolveDestinationTokens(makeInvoiceDest('onchain'));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('btc');
			expect(tokens[0].chain).toBe('bitcoin');
		});
	});

	describe('RSK address destinations', () => {
		it('chainId 30 (RSK mainnet) → rbtc', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(30));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('rbtc');
		});

		it('chainId 31 (RSK testnet) → rbtc', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(31));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('rbtc');
		});
	});

	describe('BSC address destinations', () => {
		it('chainId 56 (BSC mainnet) → usdt-bsc', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(56));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('usdt-bsc');
		});

		it('chainId 97 (BSC testnet) → usdt-bsc', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(97));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('usdt-bsc');
		});
	});

	describe('Arbitrum address destinations', () => {
		it('chainId 42161 default → usdt0-arb', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(42161));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('usdt0-arb');
		});

		it('chainId 42161 with asset=WBTC → wbtc-arb', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(42161, 'WBTC'));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('wbtc-arb');
		});

		it('chainId 42161 with asset=TBTC → tbtc-arb', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(42161, 'TBTC'));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('tbtc-arb');
		});

		it('chainId 42161 with asset=USDT0 → usdt0-arb', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(42161, 'USDT0'));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('usdt0-arb');
		});
	});

	describe('TRON pseudo chain', () => {
		it('chainId 0 → usdt-bsc (TRON pseudo)', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(0));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('usdt-bsc');
		});
	});

	describe('cross-chain EVM defaults', () => {
		it('chainId 1 (Ethereum) → usdt-bsc', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(1));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('usdt-bsc');
		});

		it('chainId 137 (Polygon) → usdt-bsc', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(137));
			expect(tokens).toHaveLength(1);
			expect(tokens[0].key).toBe('usdt-bsc');
		});
	});

	describe('unknown destinations', () => {
		it('unknown chainId 999 → empty array', () => {
			const tokens = resolveDestinationTokens(makeAddressDest(999));
			expect(tokens).toHaveLength(0);
		});
	});
});

// ---------------------------------------------------------------------------
// Chain ID sets
// ---------------------------------------------------------------------------

describe('Chain ID sets', () => {
	it('RSK_CHAIN_IDS includes 30, 31, 33', () => {
		expect(RSK_CHAIN_IDS.has(30)).toBe(true);
		expect(RSK_CHAIN_IDS.has(31)).toBe(true);
		expect(RSK_CHAIN_IDS.has(33)).toBe(true);
	});

	it('BSC_CHAIN_IDS includes 56, 97', () => {
		expect(BSC_CHAIN_IDS.has(56)).toBe(true);
		expect(BSC_CHAIN_IDS.has(97)).toBe(true);
	});

	it('ARB_CHAIN_IDS includes 42161, 421614', () => {
		expect(ARB_CHAIN_IDS.has(42161)).toBe(true);
		expect(ARB_CHAIN_IDS.has(421614)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// getTokenByKey
// ---------------------------------------------------------------------------

describe('getTokenByKey', () => {
	it('returns token for valid key', () => {
		const token = getTokenByKey('rbtc');
		expect(token).toBeDefined();
		expect(token!.symbol).toBe('RBTC');
	});

	it('returns undefined for invalid key', () => {
		const token = getTokenByKey('nonexistent');
		expect(token).toBeUndefined();
	});
});

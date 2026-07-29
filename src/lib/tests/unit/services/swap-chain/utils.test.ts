import { describe, it, expect } from 'vitest';
import {
	resolveChainId,
	resolveTokenAddress,
	CHAIN_ID_RSK,
	CHAIN_ID_BSC,
	CHAIN_ID_ARB,
	NATIVE_TOKEN,
	USDT0_ARB_ADDR,
	TBTC_ARB,
	WBTC_ARB,
	USDT_BSC,
	LIFI_ASSET_DECIMALS,
	getSymbiosisDecimals
} from '$lib/services/swap-chain/utils';

// ─── resolveChainId ────────────────────────────────────────────────

describe('resolveChainId', () => {
	it('resolves rsk to CHAIN_ID_RSK (30)', () => {
		expect(resolveChainId('rsk')).toBe(CHAIN_ID_RSK);
		expect(resolveChainId('rsk')).toBe(30);
	});

	it('resolves bsc to CHAIN_ID_BSC (56)', () => {
		expect(resolveChainId('bsc')).toBe(CHAIN_ID_BSC);
		expect(resolveChainId('bsc')).toBe(56);
	});

	it('resolves arbitrum to CHAIN_ID_ARB (42161)', () => {
		expect(resolveChainId('arbitrum')).toBe(CHAIN_ID_ARB);
		expect(resolveChainId('arbitrum')).toBe(42161);
	});

	it('resolves chain-NNN format', () => {
		expect(resolveChainId('chain-137')).toBe(137);
		expect(resolveChainId('chain-1')).toBe(1);
		expect(resolveChainId('chain-10')).toBe(10);
		expect(resolveChainId('chain-250')).toBe(250);
	});

	it('returns 0 for invalid chain-NNN (non-numeric)', () => {
		expect(resolveChainId('chain-abc')).toBe(0);
	});

	it('returns 0 for chain- with no number', () => {
		expect(resolveChainId('chain-')).toBe(0);
	});

	it('returns 0 for unknown chain names', () => {
		expect(resolveChainId('unknown')).toBe(0);
		expect(resolveChainId('ethereum')).toBe(0);
		expect(resolveChainId('polygon')).toBe(0);
	});

	it('returns 0 for empty string', () => {
		expect(resolveChainId('')).toBe(0);
	});

	it('is case-sensitive (RSK does not match rsk)', () => {
		expect(resolveChainId('RSK')).toBe(0);
		expect(resolveChainId('Arbitrum')).toBe(0);
	});

	it('deterministic for same input', () => {
		const a = resolveChainId('arbitrum');
		const b = resolveChainId('arbitrum');
		expect(a).toBe(b);
	});
});

// ─── resolveTokenAddress ───────────────────────────────────────────

describe('resolveTokenAddress', () => {
	describe('native tokens', () => {
		it('RBTC resolves to NATIVE_TOKEN', () => {
			expect(resolveTokenAddress('RBTC', CHAIN_ID_RSK)).toBe(NATIVE_TOKEN);
		});

		it('BTC resolves to NATIVE_TOKEN', () => {
			expect(resolveTokenAddress('BTC', CHAIN_ID_RSK)).toBe(NATIVE_TOKEN);
		});

		it('RBTC resolves to NATIVE_TOKEN regardless of chain', () => {
			expect(resolveTokenAddress('RBTC', CHAIN_ID_BSC)).toBe(NATIVE_TOKEN);
			expect(resolveTokenAddress('RBTC', CHAIN_ID_ARB)).toBe(NATIVE_TOKEN);
		});
	});

	describe('ERC-20 tokens', () => {
		it('USDT0 resolves to USDT0_ARB_ADDR', () => {
			expect(resolveTokenAddress('USDT0', CHAIN_ID_ARB)).toBe(USDT0_ARB_ADDR);
		});

		it('TBTC resolves to TBTC_ARB', () => {
			expect(resolveTokenAddress('TBTC', CHAIN_ID_ARB)).toBe(TBTC_ARB);
		});

		it('WBTC resolves to WBTC_ARB', () => {
			expect(resolveTokenAddress('WBTC', CHAIN_ID_ARB)).toBe(WBTC_ARB);
		});

		it('USDC falls through to NATIVE_TOKEN (not mapped)', () => {
			expect(resolveTokenAddress('USDC', CHAIN_ID_ARB)).toBe(NATIVE_TOKEN);
		});
	});

	describe('USDT chain-dependent resolution', () => {
		it('USDT on Arbitrum resolves to USDT0_ARB_ADDR', () => {
			expect(resolveTokenAddress('USDT', CHAIN_ID_ARB)).toBe(USDT0_ARB_ADDR);
		});

		it('USDT on BSC resolves to USDT_BSC', () => {
			expect(resolveTokenAddress('USDT', CHAIN_ID_BSC)).toBe(USDT_BSC);
		});

		it('USDT on RSK resolves to USDT_BSC (default fallback)', () => {
			expect(resolveTokenAddress('USDT', CHAIN_ID_RSK)).toBe(USDT_BSC);
		});

		it('USDT on arbitrary chain resolves to USDT_BSC (default fallback)', () => {
			expect(resolveTokenAddress('USDT', 137)).toBe(USDT_BSC);
		});
	});

	describe('unknown assets', () => {
		it('returns NATIVE_TOKEN for unknown asset symbol', () => {
			expect(resolveTokenAddress('UNKNOWN', CHAIN_ID_RSK)).toBe(NATIVE_TOKEN);
		});

		it('returns NATIVE_TOKEN for empty string', () => {
			expect(resolveTokenAddress('', CHAIN_ID_RSK)).toBe(NATIVE_TOKEN);
		});
	});

	describe('determinism', () => {
		it('same inputs produce same output', () => {
			const a = resolveTokenAddress('USDT', CHAIN_ID_ARB);
			const b = resolveTokenAddress('USDT', CHAIN_ID_ARB);
			expect(a).toBe(b);
		});
	});
});

// ─── Chain ID & token address constants ────────────────────────────

describe('constants', () => {
	it('CHAIN_ID_RSK is 30', () => {
		expect(CHAIN_ID_RSK).toBe(30);
	});

	it('CHAIN_ID_BSC is 56', () => {
		expect(CHAIN_ID_BSC).toBe(56);
	});

	it('CHAIN_ID_ARB is 42161', () => {
		expect(CHAIN_ID_ARB).toBe(42161);
	});

	it('NATIVE_TOKEN is zero address', () => {
		expect(NATIVE_TOKEN).toBe('0x0000000000000000000000000000000000000000');
	});

	it('token addresses are valid Ethereum address format', () => {
		const addrRegex = /^0x[0-9a-fA-F]{40}$/;
		expect(USDT0_ARB_ADDR).toMatch(addrRegex);
		expect(TBTC_ARB).toMatch(addrRegex);
		expect(WBTC_ARB).toMatch(addrRegex);
		expect(USDT_BSC).toMatch(addrRegex);
	});
});

// ─── LIFI_ASSET_DECIMALS ───────────────────────────────────────────

describe('LIFI_ASSET_DECIMALS', () => {
	it('RBTC is 18 decimals', () => {
		expect(LIFI_ASSET_DECIMALS.RBTC).toBe(18);
	});

	it('BTC is 18 decimals (LI.FI uses EVM-wrapped)', () => {
		expect(LIFI_ASSET_DECIMALS.BTC).toBe(18);
	});

	it('TBTC is 18 decimals', () => {
		expect(LIFI_ASSET_DECIMALS.TBTC).toBe(18);
	});

	it('WBTC is 8 decimals', () => {
		expect(LIFI_ASSET_DECIMALS.WBTC).toBe(8);
	});

	it('USDT is 6 decimals', () => {
		expect(LIFI_ASSET_DECIMALS.USDT).toBe(6);
	});

	it('USDT0 is 6 decimals', () => {
		expect(LIFI_ASSET_DECIMALS.USDT0).toBe(6);
	});

	it('USDC is 6 decimals', () => {
		expect(LIFI_ASSET_DECIMALS.USDC).toBe(6);
	});

	it('has exactly 7 entries', () => {
		expect(Object.keys(LIFI_ASSET_DECIMALS).length).toBe(7);
	});
});

// ─── getSymbiosisDecimals ──────────────────────────────────────────

describe('getSymbiosisDecimals', () => {
	it('RBTC is 18 decimals', () => {
		expect(getSymbiosisDecimals('RBTC')).toBe(18);
	});

	it('BTC is 8 decimals (Symbiosis uses native)', () => {
		expect(getSymbiosisDecimals('BTC')).toBe(8);
	});

	it('TBTC is 18 decimals', () => {
		expect(getSymbiosisDecimals('TBTC')).toBe(18);
	});

	it('WBTC is 8 decimals', () => {
		expect(getSymbiosisDecimals('WBTC')).toBe(8);
	});

	it('USDT0 is 6 decimals', () => {
		expect(getSymbiosisDecimals('USDT0')).toBe(6);
	});

	it('USDT is 18 decimals', () => {
		expect(getSymbiosisDecimals('USDT')).toBe(18);
	});

	it('is case-insensitive (tBTC matches TBTC)', () => {
		expect(getSymbiosisDecimals('tBTC')).toBe(18);
		expect(getSymbiosisDecimals('wbtc')).toBe(8);
		expect(getSymbiosisDecimals('usdt0')).toBe(6);
	});

	it('returns 18 for unknown assets (fallback)', () => {
		expect(getSymbiosisDecimals('UNKNOWN')).toBe(18);
		expect(getSymbiosisDecimals('')).toBe(18);
	});

	it('BTC decimals differ between LI.FI (18) and Symbiosis (8)', () => {
		expect(LIFI_ASSET_DECIMALS.BTC).not.toBe(getSymbiosisDecimals('BTC'));
	});

	it('USDT decimals differ between LI.FI (6) and Symbiosis (18)', () => {
		expect(LIFI_ASSET_DECIMALS.USDT).not.toBe(getSymbiosisDecimals('USDT'));
	});
});

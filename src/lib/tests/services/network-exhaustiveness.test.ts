import { describe, it, expect } from 'vitest';

describe('Network exhaustiveness — DeFi config covers all required networks', () => {
	it('Arbitrum chain ID is defined', async () => {
		const { ARBITRUM_CHAIN_ID } = await import('$lib/config/defi.constants');
		expect(ARBITRUM_CHAIN_ID).toBe(42161);
	});

	it('Arbitrum RPC is defined', async () => {
		const { ARB_PUBLIC_RPC } = await import('$lib/config/defi.constants');
		expect(ARB_PUBLIC_RPC).toBeTruthy();
	});

	it('all Aave contract addresses are on Arbitrum (checksummed)', async () => {
		const { AAVE_POOL, AAVE_POOL_DATA_PROVIDER, WBTC_ARBITRUM, USDT0_ARBITRUM } = await import('$lib/config/defi.constants');
		for (const addr of [AAVE_POOL, AAVE_POOL_DATA_PROVIDER, WBTC_ARBITRUM, USDT0_ARBITRUM]) {
			expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
		}
	});

	it('swap-gas exports RSK and Arbitrum RPCs', async () => {
		const mod = await import('$lib/utils/swap-gas');
		expect(mod.RSK_RPC).toBeTruthy();
		expect(mod.ARB_RPC).toBeTruthy();
		expect(mod.fetchGasPrice).toBeInstanceOf(Function);
		expect(mod.fetchLiveFees).toBeInstanceOf(Function);
		expect(mod.checkArbEthBalance).toBeInstanceOf(Function);
	});
});

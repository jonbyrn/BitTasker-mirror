/**
 * Route Resolver — Unit Tests
 *
 * Tests the pure route resolution function for all route matrix entries,
 * determinism, edge cases, and correctness.
 */

import { describe, it, expect } from 'vitest';
import { resolveRoute, type SourceWallet, type Destination } from '$lib/services/route-resolver';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAddressDest(chainId: number, address?: string): Destination {
	return {
		type: 'address',
		chainId,
		address: address ?? '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
	};
}

function makeInvoiceDest(network: 'lightning' | 'onchain', invoice?: string): Destination {
	return { type: 'invoice', network, invoice: invoice ?? 'lnbc1...' };
}

// ---------------------------------------------------------------------------
// rBTC source — address destinations
// ---------------------------------------------------------------------------

describe('resolveRoute — source: rbtc', () => {
	describe('destination: address (RSK chain)', () => {
		it('returns 1 route for RSK mainnet (chain 30)', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(30));
			expect(routes).toHaveLength(1);
		});

		it('returns 1 route for RSK testnet (chain 31)', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(31));
			expect(routes).toHaveLength(1);
		});

		it('returns direct route for rBTC to rBTC', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(30));
			expect(routes[0].id).toBe('rbtc-to-rbtc-direct');
			expect(routes[0].hops).toHaveLength(1);
			expect(routes[0].hops[0].service).toBe('direct');
		});

		it('direct rBTC route has 0% fee', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(30));
			expect(routes[0].totalFeePercent).toBe(0);
		});

		it('direct rBTC route is recommended', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(30));
			expect(routes[0].recommended).toBe(true);
		});
	});

	describe('destination: address (BSC chain)', () => {
		it('returns 2 routes for BSC mainnet (chain 56)', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(56));
			expect(routes).toHaveLength(2);
		});

		it('returns 2 routes for BSC testnet (chain 97)', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(97));
			expect(routes).toHaveLength(2);
		});

		it('returns Symbiosis route as first (recommended) for rBTC to BSC', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(56));
			expect(routes[0].id).toBe('rbtc-to-bsc-via-symbiosis');
			expect(routes[0].hops).toHaveLength(1);
			expect(routes[0].hops[0].service).toBe('symbiosis');
			expect(routes[0].recommended).toBe(true);
		});

		it('returns LI.FI route as second for rBTC to BSC', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(56));
			expect(routes[1].id).toBe('rbtc-to-bsc-via-lifi');
			expect(routes[1].hops[0].service).toBe('lifi');
		});

		it('Symbiosis rBTC to BSC route has 0.3% fee', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(56));
			expect(routes[0].totalFeePercent).toBe(0.3);
		});

		it('LI.FI rBTC to BSC route has 0.5% fee', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(56));
			expect(routes[1].totalFeePercent).toBe(0.5);
		});
	});

	describe('destination: address (other chain)', () => {
		it('returns empty for unknown chain ID 999', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(999));
			expect(routes).toHaveLength(0);
		});

		it('returns TRON routes for chain ID 0 (TRON pseudo chain)', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(0));
			expect(routes).toHaveLength(2);
			expect(routes[0].id).toBe('rbtc-to-usdt-tron-via-lifi');
			expect(routes[1].id).toBe('rbtc-to-usdt-tron-via-symbiosis');
		});

		it('returns empty for negative chain ID', () => {
			const routes = resolveRoute('rbtc', makeAddressDest(-1));
			expect(routes).toHaveLength(0);
		});
	});

	describe('destination: invoice (lightning)', () => {
		it('returns 1 route for Lightning destination', () => {
			const routes = resolveRoute('rbtc', makeInvoiceDest('lightning'));
			expect(routes).toHaveLength(1);
		});

		it('returns Boltz route for rBTC to Lightning', () => {
			const routes = resolveRoute('rbtc', makeInvoiceDest('lightning'));
			expect(routes[0].id).toBe('rbtc-to-lightning-via-boltz');
			expect(routes[0].hops).toHaveLength(1);
			expect(routes[0].hops[0].service).toBe('boltz');
		});

		it('rBTC to Lightning route has ~0.1% fee', () => {
			const routes = resolveRoute('rbtc', makeInvoiceDest('lightning'));
			expect(routes[0].totalFeePercent).toBe(0.1);
		});

		it('rBTC to Lightning route is recommended', () => {
			const routes = resolveRoute('rbtc', makeInvoiceDest('lightning'));
			expect(routes[0].recommended).toBe(true);
		});
	});

	describe('destination: invoice (onchain/BTC)', () => {
		it('returns 3 routes for onchain BTC destination', () => {
			const routes = resolveRoute('rbtc', makeInvoiceDest('onchain'));
			expect(routes).toHaveLength(3);
		});

		it('returns LI.FI route first for rBTC to BTC', () => {
			const routes = resolveRoute('rbtc', makeInvoiceDest('onchain'));
			expect(routes[0].id).toBe('rbtc-to-btc-via-lifi');
			expect(routes[0].hops).toHaveLength(1);
			expect(routes[0].hops[0].service).toBe('lifi');
		});

		it('returns Symbiosis route second for rBTC to BTC', () => {
			const routes = resolveRoute('rbtc', makeInvoiceDest('onchain'));
			expect(routes[1].id).toBe('rbtc-to-btc-via-symbiosis');
			expect(routes[1].hops[0].service).toBe('symbiosis');
		});

		it('returns Boltz route third for rBTC to BTC', () => {
			const routes = resolveRoute('rbtc', makeInvoiceDest('onchain'));
			expect(routes[2].id).toBe('rbtc-to-btc-via-boltz');
			expect(routes[2].hops[0].service).toBe('boltz');
		});

		it('rBTC to BTC LI.FI route has 0.5% fee', () => {
			const routes = resolveRoute('rbtc', makeInvoiceDest('onchain'));
			expect(routes[0].totalFeePercent).toBe(0.5);
		});
	});
});

// ---------------------------------------------------------------------------
// USDT (BSC) source
// ---------------------------------------------------------------------------

describe('resolveRoute — source: usdt-bsc', () => {
	describe('destination: address (BSC chain)', () => {
		it('returns 1 route for BSC mainnet (chain 56)', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(56));
			expect(routes).toHaveLength(1);
		});

		it('returns 1 route for BSC testnet (chain 97)', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(97));
			expect(routes).toHaveLength(1);
		});

		it('returns direct route for USDT to BSC', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(56));
			expect(routes[0].id).toBe('usdt-to-bsc-direct');
			expect(routes[0].hops).toHaveLength(1);
			expect(routes[0].hops[0].service).toBe('direct');
		});

		it('direct USDT to BSC route has 0% fee', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(56));
			expect(routes[0].totalFeePercent).toBe(0);
		});

		it('direct USDT to BSC route is recommended', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(56));
			expect(routes[0].recommended).toBe(true);
		});
	});

	describe('destination: address (RSK chain)', () => {
		it('returns 2 routes for RSK mainnet (chain 30)', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(30));
			expect(routes).toHaveLength(2);
		});

		it('returns 2 routes for RSK testnet (chain 31)', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(31));
			expect(routes).toHaveLength(2);
		});

		it('first route is recommended LI.FI', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(30));
			expect(routes[0].id).toBe('usdt-to-rbtc-via-lifi');
			expect(routes[0].recommended).toBe(true);
			expect(routes[0].hops).toHaveLength(1);
			expect(routes[0].hops[0].service).toBe('lifi');
		});

		it('second route is Symbiosis', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(30));
			expect(routes[1].id).toBe('usdt-to-rbtc-via-symbiosis');
			expect(routes[1].hops[0].service).toBe('symbiosis');
		});
	});

	describe('destination: invoice (onchain/BTC)', () => {
		it('returns 3 routes for onchain BTC destination', () => {
			const routes = resolveRoute('usdt-bsc', makeInvoiceDest('onchain'));
			expect(routes).toHaveLength(3);
		});

		it('returns LI.FI route first for USDT to BTC', () => {
			const routes = resolveRoute('usdt-bsc', makeInvoiceDest('onchain'));
			expect(routes[0].id).toBe('usdt-to-btc-via-lifi');
			expect(routes[0].hops).toHaveLength(1);
			expect(routes[0].hops[0].service).toBe('lifi');
		});

		it('returns Symbiosis route second for USDT to BTC', () => {
			const routes = resolveRoute('usdt-bsc', makeInvoiceDest('onchain'));
			expect(routes[1].id).toBe('usdt-to-btc-via-symbiosis');
			expect(routes[1].hops[0].service).toBe('symbiosis');
		});

		it('returns Changelly route third for USDT to BTC', () => {
			const routes = resolveRoute('usdt-bsc', makeInvoiceDest('onchain'));
			expect(routes[2].id).toBe('usdt-to-btc-via-changelly');
		});

		it('USDT to BTC LI.FI route has 0.5% fee', () => {
			const routes = resolveRoute('usdt-bsc', makeInvoiceDest('onchain'));
			expect(routes[0].totalFeePercent).toBe(0.5);
		});
	});

	describe('destination: invoice (lightning)', () => {
		it('returns 1 route for Lightning destination', () => {
			const routes = resolveRoute('usdt-bsc', makeInvoiceDest('lightning'));
			expect(routes).toHaveLength(1);
		});

		it('returns 2-hop Changelly + Boltz route for USDT to Lightning', () => {
			const routes = resolveRoute('usdt-bsc', makeInvoiceDest('lightning'));
			expect(routes[0].id).toBe('usdt-to-lightning-via-changelly-boltz');
			expect(routes[0].hops).toHaveLength(2);
			expect(routes[0].hops[0].service).toBe('changelly');
			expect(routes[0].hops[1].service).toBe('boltz');
		});

		it('USDT to Lightning route has 1.13% fee (compound)', () => {
			const routes = resolveRoute('usdt-bsc', makeInvoiceDest('lightning'));
			// (1 - 0.25/100) * (1 - 0.88/100) = 0.988706
			// 1 - 0.988706 = 0.011294 -> 1.13%
			expect(routes[0].totalFeePercent).toBe(1.13);
		});

		it('USDT to Lightning route is recommended', () => {
			const routes = resolveRoute('usdt-bsc', makeInvoiceDest('lightning'));
			expect(routes[0].recommended).toBe(true);
		});
	});

	describe('destination: address (other chain)', () => {
		it('returns empty for unknown chain ID 999', () => {
			const routes = resolveRoute('usdt-bsc', makeAddressDest(999));
			expect(routes).toHaveLength(0);
		});
	});
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('determinism', () => {
	it('returns identical results for same rBTC -> BSC inputs', () => {
		const dest = makeAddressDest(56);
		const result1 = resolveRoute('rbtc', dest);
		const result2 = resolveRoute('rbtc', dest);
		expect(result1).toEqual(result2);
	});

	it('returns identical results for same USDT -> Lightning inputs', () => {
		const dest = makeInvoiceDest('lightning');
		const result1 = resolveRoute('usdt-bsc', dest);
		const result2 = resolveRoute('usdt-bsc', dest);
		expect(result1).toEqual(result2);
	});

	it('returns identical results for same rBTC -> RSK inputs', () => {
		const dest = makeAddressDest(30);
		const result1 = resolveRoute('rbtc', dest);
		const result2 = resolveRoute('rbtc', dest);
		expect(result1).toEqual(result2);
	});

	it('returns identical results for same USDT -> RSK inputs (2 routes)', () => {
		const dest = makeAddressDest(30);
		const result1 = resolveRoute('usdt-bsc', dest);
		const result2 = resolveRoute('usdt-bsc', dest);
		expect(result1).toHaveLength(2);
		expect(result1).toEqual(result2);
	});
});

// ---------------------------------------------------------------------------
// Route structural properties
// ---------------------------------------------------------------------------

describe('route structural properties', () => {
	it('all routes have non-empty id', () => {
		const destinations = [
			makeAddressDest(30),
			makeAddressDest(56),
			makeInvoiceDest('lightning'),
			makeInvoiceDest('onchain')
		];

		for (const source of ['rbtc', 'usdt-bsc'] as SourceWallet[]) {
			for (const dest of destinations) {
				const routes = resolveRoute(source, dest);
				for (const route of routes) {
					expect(route.id).toBeTruthy();
					expect(typeof route.id).toBe('string');
				}
			}
		}
	});

	it('all routes have unique IDs per result set', () => {
		const routes = resolveRoute('usdt-bsc', makeAddressDest(30));
		const ids = routes.map((r) => r.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(routes.length);
	});

	it('each route has at least one hop', () => {
		const routes = resolveRoute('usdt-bsc', makeInvoiceDest('lightning'));
		for (const route of routes) {
			expect(route.hops.length).toBeGreaterThanOrEqual(1);
		}
	});

	it('each hop has a valid service type', () => {
		const validServices = new Set(['direct', 'changelly', 'boltz', 'lifi', 'symbiosis']);
		const destinations = [
			makeAddressDest(30),
			makeAddressDest(56),
			makeInvoiceDest('lightning'),
			makeInvoiceDest('onchain')
		];

		for (const source of ['rbtc', 'usdt-bsc'] as SourceWallet[]) {
			for (const dest of destinations) {
				const routes = resolveRoute(source, dest);
				for (const route of routes) {
					for (const hop of route.hops) {
						expect(validServices.has(hop.service)).toBe(true);
					}
				}
			}
		}
	});

	it('each hop has non-negative feePercent', () => {
		const routes = resolveRoute('rbtc', makeAddressDest(30));
		for (const route of routes) {
			for (const hop of route.hops) {
				expect(hop.feePercent).toBeGreaterThanOrEqual(0);
			}
		}
	});

	it('each hop has estimatedTimeMin <= estimatedTimeMax', () => {
		const destinations = [
			makeAddressDest(30),
			makeAddressDest(56),
			makeInvoiceDest('lightning'),
			makeInvoiceDest('onchain')
		];

		for (const source of ['rbtc', 'usdt-bsc'] as SourceWallet[]) {
			for (const dest of destinations) {
				const routes = resolveRoute(source, dest);
				for (const route of routes) {
					for (const hop of route.hops) {
						expect(hop.estimatedTimeMin).toBeLessThanOrEqual(hop.estimatedTimeMax);
					}
				}
			}
		}
	});

	it('totalFeePercent equals sum of individual hop fees for single-hop routes', () => {
		const routes = resolveRoute('rbtc', makeAddressDest(56));
		const route = routes[0];
		const sumOfHopFees = route.hops.reduce((sum, h) => sum + h.feePercent, 0);
		expect(route.totalFeePercent).toBe(sumOfHopFees);
	});

	it('estimatedTime is formatted as a string', () => {
		const destinations = [
			makeAddressDest(30),
			makeAddressDest(56),
			makeInvoiceDest('lightning'),
			makeInvoiceDest('onchain')
		];

		for (const source of ['rbtc', 'usdt-bsc'] as SourceWallet[]) {
			for (const dest of destinations) {
				const routes = resolveRoute(source, dest);
				for (const route of routes) {
					expect(typeof route.estimatedTime).toBe('string');
					expect(route.estimatedTime.length).toBeGreaterThan(0);
				}
			}
		}
	});

	it('recommended flag is boolean', () => {
		const routes = resolveRoute('usdt-bsc', makeAddressDest(30));
		for (const route of routes) {
			expect(typeof route.recommended).toBe('boolean');
		}
	});
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
	it('invoice with unknown network returns empty', () => {
		// @ts-expect-error - testing runtime behavior with invalid network
		const routes = resolveRoute('rbtc', { type: 'invoice', network: 'invalid', invoice: 'x' });
		expect(routes).toHaveLength(0);
	});

	it('direct routes have feePercent 0 on all hops', () => {
		const directRoutes = [
			...resolveRoute('rbtc', makeAddressDest(30)),
			...resolveRoute('usdt-bsc', makeAddressDest(56))
		];
		for (const route of directRoutes) {
			expect(route.totalFeePercent).toBe(0);
			for (const hop of route.hops) {
				expect(hop.feePercent).toBe(0);
			}
		}
	});

	it('Direct routes use estimated time "~1 min" for RSK, "~1 sec" for BSC', () => {
		const rbtcDirect = resolveRoute('rbtc', makeAddressDest(30));
		expect(rbtcDirect[0].estimatedTime).toBe('~1 min');

		const usdtDirect = resolveRoute('usdt-bsc', makeAddressDest(56));
		expect(usdtDirect[0].estimatedTime).toBe('~1 sec');
	});
});

// ---------------------------------------------------------------------------
// Route matrix completeness
// ---------------------------------------------------------------------------

describe('route matrix completeness', () => {
	it('rBTC source has routes for all supported destination types', () => {
		expect(resolveRoute('rbtc', makeAddressDest(30)).length).toBeGreaterThanOrEqual(1);
		expect(resolveRoute('rbtc', makeAddressDest(56)).length).toBeGreaterThanOrEqual(1);
		expect(resolveRoute('rbtc', makeInvoiceDest('lightning')).length).toBeGreaterThanOrEqual(1);
		expect(resolveRoute('rbtc', makeInvoiceDest('onchain')).length).toBeGreaterThanOrEqual(1);
		expect(resolveRoute('rbtc', makeAddressDest(999)).length).toBe(0);
	});

	it('USDT source has routes for all supported destination types', () => {
		expect(resolveRoute('usdt-bsc', makeAddressDest(56)).length).toBeGreaterThanOrEqual(1);
		expect(resolveRoute('usdt-bsc', makeAddressDest(30)).length).toBeGreaterThanOrEqual(1);
		expect(resolveRoute('usdt-bsc', makeInvoiceDest('lightning')).length).toBeGreaterThanOrEqual(1);
		expect(resolveRoute('usdt-bsc', makeInvoiceDest('onchain')).length).toBeGreaterThanOrEqual(1);
		expect(resolveRoute('usdt-bsc', makeAddressDest(999)).length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// USDT0 (RSK) source
// ---------------------------------------------------------------------------
describe('resolveRoute — source: usdt0-rsk', () => {
	it('returns 1 route for RSK chain (same-chain swap)', () => {
		const routes = resolveRoute('usdt0-rsk', makeAddressDest(30));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('usdt0-rsk-to-rbtc-via-symbiosis');
	});

	it('returns 1 route for BSC chain', () => {
		const routes = resolveRoute('usdt0-rsk', makeAddressDest(56));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('usdt0-rsk-to-bsc-via-symbiosis');
	});

	it('returns lightning route via symbiosis+boltz', () => {
		const routes = resolveRoute('usdt0-rsk', makeInvoiceDest('lightning'));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('usdt0-rsk-to-lightning-via-symbiosis-boltz');
		expect(routes[0].hops).toHaveLength(2);
	});

	it('returns onchain BTC route via symbiosis+boltz', () => {
		const routes = resolveRoute('usdt0-rsk', makeInvoiceDest('onchain'));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('usdt0-rsk-to-btc-via-symbiosis-boltz');
	});

	it('returns empty for unknown chain', () => {
		expect(resolveRoute('usdt0-rsk', makeAddressDest(999))).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// USDT0 (Arbitrum) source
// ---------------------------------------------------------------------------
describe('resolveRoute — source: usdt0-arb', () => {
	it('returns 1 direct route for Arbitrum chain (same-chain)', () => {
		const routes = resolveRoute('usdt0-arb', makeAddressDest(42161));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('usdt0-arb-to-usdt0-arb-direct');
		expect(routes[0].hops[0].service).toBe('direct');
	});

	it('returns 3 routes for RSK chain', () => {
		const routes = resolveRoute('usdt0-arb', makeAddressDest(30));
		expect(routes).toHaveLength(3);
		expect(routes[0].id).toBe('usdt0-arb-to-rbtc-via-symbiosis-boltz');
	});

	it('returns onchain BTC route via symbiosis+boltz', () => {
		const routes = resolveRoute('usdt0-arb', makeInvoiceDest('onchain'));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('usdt0-arb-to-btc-via-symbiosis-boltz');
	});

	it('returns empty for lightning invoice', () => {
		expect(resolveRoute('usdt0-arb', makeInvoiceDest('lightning'))).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// DOC (RSK) source
// ---------------------------------------------------------------------------
describe('resolveRoute — source: doc-rsk', () => {
	it('returns 1 route for RSK chain', () => {
		const routes = resolveRoute('doc-rsk', makeAddressDest(30));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('doc-rsk-to-rbtc-via-symbiosis');
	});

	it('returns 1 route for BSC chain', () => {
		const routes = resolveRoute('doc-rsk', makeAddressDest(56));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('doc-rsk-to-bsc-via-symbiosis');
		expect(routes[0].hops).toHaveLength(2);
	});

	it('returns lightning route via symbiosis+boltz', () => {
		const routes = resolveRoute('doc-rsk', makeInvoiceDest('lightning'));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('doc-rsk-to-lightning-via-symbiosis-boltz');
	});

	it('returns onchain BTC route via symbiosis+boltz', () => {
		const routes = resolveRoute('doc-rsk', makeInvoiceDest('onchain'));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('doc-rsk-to-btc-via-symbiosis-boltz');
	});
});

// ---------------------------------------------------------------------------
// BTC on-chain source
// ---------------------------------------------------------------------------
describe('resolveRoute — source: btc-onchain', () => {
	it('returns 1 direct route for BTC chain (chainId 1)', () => {
		const routes = resolveRoute('btc-onchain', makeAddressDest(1));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('btc-onchain-direct');
	});

	it('returns 1 Boltz route for RSK chain', () => {
		const routes = resolveRoute('btc-onchain', makeAddressDest(30));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('btc-to-rbtc-via-boltz');
	});

	it('returns 1 route for Arbitrum chain (multi-hop)', () => {
		const routes = resolveRoute('btc-onchain', makeAddressDest(42161));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('btc-to-usdt0-arb-via-boltz');
		expect(routes[0].hops).toHaveLength(2);
	});

	it('returns empty for lightning invoice', () => {
		expect(resolveRoute('btc-onchain', makeInvoiceDest('lightning'))).toHaveLength(0);
	});

	it('returns empty for unknown chain', () => {
		expect(resolveRoute('btc-onchain', makeAddressDest(999))).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// WBTC (Arbitrum) source
// ---------------------------------------------------------------------------
describe('resolveRoute — source: wbtc-arb', () => {
	it('returns 1 route for USDT0 on Arbitrum', () => {
		const dest: Destination = { type: 'address', chainId: 42161, address: '0x...', asset: 'USDT0' };
		const routes = resolveRoute('wbtc-arb', dest);
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('wbtc-to-usdt0-arb-via-symbiosis');
	});

	it('returns 1 route for TBTC on Arbitrum', () => {
		const dest: Destination = { type: 'address', chainId: 42161, address: '0x...', asset: 'TBTC' };
		const routes = resolveRoute('wbtc-arb', dest);
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('wbtc-to-tbtc-arb-via-symbiosis');
	});

	it('returns empty for RSK chain', () => {
		expect(resolveRoute('wbtc-arb', makeAddressDest(30))).toHaveLength(0);
	});

	it('returns empty for invoice destinations', () => {
		expect(resolveRoute('wbtc-arb', makeInvoiceDest('lightning'))).toHaveLength(0);
		expect(resolveRoute('wbtc-arb', makeInvoiceDest('onchain'))).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// TBTC (Arbitrum) source
// ---------------------------------------------------------------------------
describe('resolveRoute — source: tbtc-arb', () => {
	it('returns 1 route for WBTC on Arbitrum', () => {
		const dest: Destination = { type: 'address', chainId: 42161, address: '0x...', asset: 'WBTC' };
		const routes = resolveRoute('tbtc-arb', dest);
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('tbtc-to-wbtc-arb-via-symbiosis');
	});

	it('returns 1 route for USDT0 on Arbitrum', () => {
		const dest: Destination = { type: 'address', chainId: 42161, address: '0x...', asset: 'USDT0' };
		const routes = resolveRoute('tbtc-arb', dest);
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('tbtc-to-usdt0-arb-via-symbiosis');
	});

	it('returns 1 Boltz route for RSK chain', () => {
		const routes = resolveRoute('tbtc-arb', makeAddressDest(30));
		expect(routes).toHaveLength(1);
		expect(routes[0].id).toBe('tbtc-to-rbtc-via-boltz');
	});

	it('returns empty for invoice destinations', () => {
		expect(resolveRoute('tbtc-arb', makeInvoiceDest('lightning'))).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// Cross-chain EVM routes
// ---------------------------------------------------------------------------
describe('resolveRoute — cross-chain EVM destinations', () => {
	it('rbtc to Ethereum mainnet (chain 1) returns LI.FI + Symbiosis', () => {
		const routes = resolveRoute('rbtc', makeAddressDest(1));
		expect(routes).toHaveLength(2);
		expect(routes[0].hops[0].service).toBe('lifi');
		expect(routes[1].hops[0].service).toBe('symbiosis');
	});

	it('usdt-bsc to Polygon (chain 137) returns LI.FI + Symbiosis', () => {
		const routes = resolveRoute('usdt-bsc', makeAddressDest(137));
		expect(routes).toHaveLength(2);
	});

	it('usdt0-arb to Ethereum (chain 1) returns LI.FI + Symbiosis', () => {
		const routes = resolveRoute('usdt0-arb', makeAddressDest(1));
		expect(routes).toHaveLength(2);
	});
});

// ---------------------------------------------------------------------------
// USDT (BSC) Lightning compound fee
// ---------------------------------------------------------------------------
describe('resolveRoute — usdt-bsc lightning compound fee', () => {
	it('has 1.13% compound fee for Changelly+Boltz', () => {
		const routes = resolveRoute('usdt-bsc', makeInvoiceDest('lightning'));
		expect(routes[0].totalFeePercent).toBe(1.13);
	});
});

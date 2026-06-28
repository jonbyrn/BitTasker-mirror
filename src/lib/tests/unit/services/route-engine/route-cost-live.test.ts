/**
 * Route Engine — RBTC→USDT0 Live Route Cost Test
 *
 * Calls resolveRoutes('rbtc', { type: 'address', chainId: 42161, asset: 'USDT0' }, 100000)
 * with LIVE providers and logs all returned routes with costs.
 *
 * Run: npx vitest run --config vitest.config.ts src/lib/tests/unit/services/route-engine/route-cost-live.test.ts
 * Or:  LIVE_ROUTES=1 npm run test:unit -- --run src/lib/tests/unit/services/route-engine/route-cost-live.test.ts
 */

import { describe, it, expect } from 'vitest';
import { resolveRoutes } from '$lib/services/route-engine/engine';

// Only run when explicitly requested (hits live APIs)
describe.skipIf(!process.env.LIVE_ROUTES)('RBTC→USDT0 live route costs', () => {
	it('resolves all routes and logs costs for 100k sats', async () => {
		const destination = {
			type: 'address' as const,
			chainId: 42161,
			address: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
			asset: 'USDT0'
		};

		const result = await resolveRoutes('rbtc', destination, 100_000);

		console.log('\n=== resolveRoutes("rbtc", {chainId:42161, asset:"USDT0"}, 100000) ===');
		console.log(`isLive: ${result.isLive}`);
		console.log(`routes: ${result.routes.length}`);
		console.log(`errors: ${result.errors.length}`);
		console.log(`recommended: ${result.recommended?.id ?? 'none'}`);

		if (result.errors.length > 0) {
			console.log('\nProvider errors:');
			for (const e of result.errors) {
				console.log(`  ${e.provider}: ${e.error}`);
			}
		}

		if (result.routes.length === 0) {
			console.log('\nNo routes returned.');
			return;
		}

		console.log('\n--- All routes (ranked best-first) ---');
		for (const route of result.routes) {
			console.log(`\n  [${route.id}] ${route.label}`);
			console.log(`    recommended:      ${route.recommended}`);
			console.log(`    totalFeePercent:  ${route.totalFeePercent.toFixed(4)}%`);
			console.log(`    estimatedTime:    ${route.estimatedTime}`);
			console.log(`    gasCostWei:       ${route.gasCostWei ?? 'N/A'}`);
			console.log(`    outputSats:       ${route.outputSats?.toLocaleString() ?? 'N/A'}`);
			console.log(`    outputAmount:     ${route.outputAmount ?? 'N/A'}`);
			console.log(`    outputDecimals:   ${route.outputDecimals ?? 'N/A'}`);
			if (route.feeCosts?.length) {
				console.log(`    feeCosts:`);
				for (const fc of route.feeCosts) {
					console.log(`      ${fc.name}: ${fc.amount}`);
				}
			}
			console.log(`    hops (${route.hops.length}):`);
			for (const hop of route.hops) {
				console.log(
					`      ${hop.service}: ${hop.fromAsset}(${hop.fromChain}) → ${hop.toAsset}(${hop.toChain})`
				);
				console.log(
					`        feePercent: ${hop.feePercent.toFixed(4)}%, time: ${hop.estimatedTimeMin}-${hop.estimatedTimeMax}min`
				);
				console.log(`        gasCostWei: ${hop.gasCostWei ?? 'N/A'}`);
				if (hop.feeCosts?.length) {
					for (const fc of hop.feeCosts) {
						console.log(`        feeCost: ${fc.name}: ${fc.amount}`);
					}
				}
			}
		}

		// Total cost comparison
		console.log('\n--- Total cost comparison ---');
		const inputSats = 100_000;
		for (const route of result.routes) {
			const totalCostSats = route.outputSats != null ? inputSats - route.outputSats : null;
			let gasCostSats: number | null = null;
			if (route.gasCostWei) {
				try {
					gasCostSats = Number(BigInt(route.gasCostWei) / 10_000_000_000n);
				} catch {
					/* ignore */
				}
			}

			console.log(`  ${route.id}:`);
			console.log(`    feePercent:      ${route.totalFeePercent.toFixed(4)}%`);
			console.log(`    outputSats:      ${route.outputSats?.toLocaleString() ?? 'N/A'}`);
			console.log(`    totalCostSats:   ${totalCostSats?.toLocaleString() ?? 'N/A'}`);
			console.log(`    gasCostSats:     ${gasCostSats?.toLocaleString() ?? 'N/A'}`);
		}

		// Cheapest by feePercent
		const byFeePercent = [...result.routes].sort((a, b) => a.totalFeePercent - b.totalFeePercent);
		console.log(
			`\n  Cheapest by feePercent: ${byFeePercent[0].id} (${byFeePercent[0].totalFeePercent.toFixed(4)}%)`
		);

		// Cheapest by total cost (input - output)
		const withOutput = result.routes.filter((r) => r.outputSats != null);
		if (withOutput.length > 0) {
			const byTotalCost = [...withOutput].sort(
				(a, b) => inputSats - a.outputSats! - (inputSats - b.outputSats!)
			);
			console.log(
				`  Cheapest by total cost: ${byTotalCost[0].id} (output: ${byTotalCost[0].outputSats?.toLocaleString()} sats, cost: ${(inputSats - byTotalCost[0].outputSats!).toLocaleString()} sats)`
			);
		}

		expect(result.isLive).toBe(true);
	}, 30_000);
});

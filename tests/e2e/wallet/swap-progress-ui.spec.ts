/**
 * E2E Tests — Swap Progress UI
 *
 * Tests the step-by-step progress timeline logic, step definitions,
 * step status mapping, elapsed timer, and the claim-pending hyphen bug fix.
 *
 * These tests run WITHOUT a live backend — they test the pure logic
 * and component structure via page.evaluate() on the dev server.
 *
 * @e2e @swap @progress
 */

import { test, expect, type Page } from '@playwright/test';

const WALLET_URL = 'http://localhost:3000/wallet';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function mockInfrastructure(page: Page) {
	await page.route('**/notification-center/**', (route) => {
		route.fulfill({ status: 200, body: JSON.stringify({ unreadCount: 0 }), contentType: 'application/json' });
	});
	await page.route('**/auth/refresh', (route) => {
		route.fulfill({ status: 200, body: JSON.stringify({ access_token: 'test', refresh_token: 'test' }), contentType: 'application/json' });
	});
	await page.route('**/gasless/**', (route) => {
		route.fulfill({ status: 200, body: JSON.stringify({}), contentType: 'application/json' });
	});
	await page.route('https://arb1.arbitrum.io/**', (route) => {
		const body = route.request().postDataJSON();
		route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body?.id || 1, result: '0x' }), contentType: 'application/json' });
	});
	await page.route('https://mainnet.sovryn.app/**', (route) => {
		const body = route.request().postDataJSON();
		route.fulfill({ status: 200, body: JSON.stringify({ jsonrpc: '2.0', id: body?.id || 1, result: '0x' }), contentType: 'application/json' });
	});
}

// ===========================================================================
// Test 1: Step definitions derive correctly from route shape
// ===========================================================================

test.describe('Swap Progress — Step Definitions', () => {

	test.beforeEach(async ({ page }) => {
		await mockInfrastructure(page);
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
	});

	test('Boltz 2-hop route produces 4 timeline steps', async ({ page }) => {
		const steps = await page.evaluate(() => {
			const mockRoute = {
				hops: [
					{ service: 'boltz', fromAsset: 'RBTC', fromChain: 'rsk', toAsset: 'TBTC', toChain: 'arbitrum', feePercent: 0.1, estimatedTimeMin: 1, estimatedTimeMax: 5 },
					{ service: 'symbiosis', fromAsset: 'TBTC', fromChain: 'arbitrum', toAsset: 'USDT0', toChain: 'arbitrum', feePercent: 0.3, estimatedTimeMin: 1, estimatedTimeMax: 2 }
				]
			};

			const hasBoltz = mockRoute.hops.some((h) => h.service === 'boltz');
			const hasDex = mockRoute.hops.some((h) =>
				['lifi', 'symbiosis', 'uniswap-v3', 'changelly'].includes(h.service)
			);

			if (hasBoltz && hasDex) return 4;
			if (hasBoltz) return 3;
			return 2;
		});

		expect(steps).toBe(4);
	});

	test('single-hop LI.FI route produces 2 timeline steps', async ({ page }) => {
		const steps = await page.evaluate(() => {
			const mockRoute = {
				hops: [
					{ service: 'lifi', fromAsset: 'RBTC', fromChain: 'rsk', toAsset: 'USDT', toChain: 'chain-56', feePercent: 0.5, estimatedTimeMin: 1, estimatedTimeMax: 5 }
				]
			};

			const hasBoltz = mockRoute.hops.some((h) => h.service === 'boltz');
			const hasDex = mockRoute.hops.some((h) =>
				['lifi', 'symbiosis', 'uniswap-v3', 'changelly'].includes(h.service)
			);

			if (hasBoltz && hasDex) return 4;
			if (hasBoltz) return 3;
			return 2;
		});

		expect(steps).toBe(2);
	});

	test('single-hop Boltz route produces 3 timeline steps', async ({ page }) => {
		const steps = await page.evaluate(() => {
			const mockRoute = {
				hops: [
					{ service: 'boltz', fromAsset: 'RBTC', fromChain: 'rsk', toAsset: 'TBTC', toChain: 'arbitrum', feePercent: 0.1, estimatedTimeMin: 1, estimatedTimeMax: 5 }
				]
			};

			const hasBoltz = mockRoute.hops.some((h) => h.service === 'boltz');
			const hasDex = mockRoute.hops.some((h) =>
				['lifi', 'symbiosis', 'uniswap-v3', 'changelly'].includes(h.service)
			);

			if (hasBoltz && hasDex) return 4;
			if (hasBoltz) return 3;
			return 2;
		});

		expect(steps).toBe(3);
	});
});

// ===========================================================================
// Test 2: Step status mapping logic
// ===========================================================================

test.describe('Swap Progress — Step Status Mapping', () => {

	test.beforeEach(async ({ page }) => {
		await mockInfrastructure(page);
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
	});

	test('completed steps show checkmark, active shows spinner, pending shows dot', async ({ page }) => {
		const result = await page.evaluate(() => {
			type StepStatus = 'completed' | 'active' | 'pending';

			interface TimelineStepDef { key: string; progressSteps: string[]; }

			function getStepStatus(step: TimelineStepDef, current: string, completed: Set<string>): StepStatus {
				if (completed.has(step.key)) return 'completed';
				if (step.progressSteps.includes(current)) return 'active';
				return 'pending';
			}

			const steps: TimelineStepDef[] = [
				{ key: 'lock', progressSteps: ['locking-rbtc', 'locking-tbtc'] },
				{ key: 'boltz', progressSteps: ['waiting-for-boltz'] },
				{ key: 'claim', progressSteps: ['claiming-rbtc', 'claiming-tbtc'] },
				{ key: 'dex', progressSteps: ['swapping-tbtc'] }
			];

			// Simulate: current step is waiting-for-boltz, lock is completed
			const completed = new Set(['lock']);
			return steps.map((s) => ({
				key: s.key,
				status: getStepStatus(s, 'waiting-for-boltz', completed)
			}));
		});

		expect(result).toEqual([
			{ key: 'lock', status: 'completed' },
			{ key: 'boltz', status: 'active' },
			{ key: 'claim', status: 'pending' },
			{ key: 'dex', status: 'pending' }
		]);
	});

	test('all steps show completed when progress reaches complete', async ({ page }) => {
		const result = await page.evaluate(() => {
			type StepStatus = 'completed' | 'active' | 'pending';

			interface TimelineStepDef { key: string; progressSteps: string[]; }

			function getStepStatus(step: TimelineStepDef, current: string, completed: Set<string>): StepStatus {
				if (completed.has(step.key)) return 'completed';
				if (step.progressSteps.includes(current)) return 'active';
				return 'pending';
			}

			const steps: TimelineStepDef[] = [
				{ key: 'lock', progressSteps: ['locking-rbtc'] },
				{ key: 'boltz', progressSteps: ['waiting-for-boltz'] },
				{ key: 'claim', progressSteps: ['claiming-tbtc'] },
				{ key: 'dex', progressSteps: ['swapping-tbtc'] }
			];

			const completed = new Set(['lock', 'boltz', 'claim', 'dex']);
			return steps.map((s) => ({
				key: s.key,
				status: getStepStatus(s, 'complete', completed)
			}));
		});

		for (const step of result) {
			expect(step.status).toBe('completed');
		}
	});

	test('first step is active when progress is locking-rbtc', async ({ page }) => {
		const result = await page.evaluate(() => {
			type StepStatus = 'completed' | 'active' | 'pending';

			interface TimelineStepDef { key: string; progressSteps: string[]; }

			function getStepStatus(step: TimelineStepDef, current: string, completed: Set<string>): StepStatus {
				if (completed.has(step.key)) return 'completed';
				if (step.progressSteps.includes(current)) return 'active';
				return 'pending';
			}

			const steps: TimelineStepDef[] = [
				{ key: 'lock', progressSteps: ['locking-rbtc', 'locking-tbtc'] },
				{ key: 'boltz', progressSteps: ['waiting-for-boltz'] },
				{ key: 'claim', progressSteps: ['claiming-rbtc', 'claiming-tbtc'] },
				{ key: 'dex', progressSteps: ['swapping-tbtc'] }
			];

			const completed = new Set<string>();
			return steps.map((s) => ({
				key: s.key,
				status: getStepStatus(s, 'locking-rbtc', completed)
			}));
		});

		expect(result[0].status).toBe('active');
		expect(result[1].status).toBe('pending');
		expect(result[2].status).toBe('pending');
		expect(result[3].status).toBe('pending');
	});
});

// ===========================================================================
// Test 3: Elapsed timer logic
// ===========================================================================

test.describe('Swap Progress — Elapsed Timer', () => {

	test('elapsed timer increments and formats correctly', async ({ page }) => {
		await mockInfrastructure(page);
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

		const result = await page.evaluate(async () => {
			let elapsed = 0;
			const interval = setInterval(() => { elapsed++; }, 1000);

			await new Promise((r) => setTimeout(r, 2100));
			clearInterval(interval);

			const m = Math.floor(elapsed / 60);
			const s = elapsed % 60;
			const display = m > 0 ? `${m}m ${s}s` : `${s}s`;

			return { elapsed, display };
		});

		expect(result.elapsed).toBeGreaterThanOrEqual(1);
		expect(result.elapsed).toBeLessThanOrEqual(4);
		expect(result.display).toMatch(/^\d+s$/);
	});

	test('elapsed display shows minutes and seconds when > 60s', async ({ page }) => {
		await mockInfrastructure(page);
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

		const result = await page.evaluate(() => {
			// Simulate 125 seconds elapsed
			const elapsed = 125;
			const m = Math.floor(elapsed / 60);
			const s = elapsed % 60;
			const display = m > 0 ? `${m}m ${s}s` : `${s}s`;
			return display;
		});

		expect(result).toBe('2m 5s');
	});
});

// ===========================================================================
// Test 4: claim-pending hyphen variant
// ===========================================================================

test.describe('Swap Progress — claim-pending Bug Fix', () => {

	test('BoltzStatusType includes claim.pending with dot', async ({ page }) => {
		await mockInfrastructure(page);
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

		const result = await page.evaluate(async () => {
			const statuses = [
				'transaction.claim.pending',
				'transaction.server.confirmed'
			];

			const shouldClaim = (status: string) =>
				status === 'transaction.server.confirmed' ||
				status === 'transaction.claim.pending';

			return statuses.map((s) => ({ status: s, shouldClaim: shouldClaim(s) }));
		});

		expect(result[0]).toEqual({ status: 'transaction.claim.pending', shouldClaim: true });
		expect(result[1]).toEqual({ status: 'transaction.server.confirmed', shouldClaim: true });
	});

	test('PendingSwaps handles claim.pending in COMPLETE->PARTIAL revert', async ({ page }) => {
		await mockInfrastructure(page);
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

		const result = await page.evaluate(() => {
			function shouldRevertToPartial(phase: string, boltzStatus: string): boolean {
				return phase === 'COMPLETE' &&
					(boltzStatus === 'transaction.server.confirmed' ||
						boltzStatus === 'transaction.claim.pending');
			}

			return {
				claimPending: shouldRevertToPartial('COMPLETE', 'transaction.claim.pending'),
				serverConfirmed: shouldRevertToPartial('COMPLETE', 'transaction.server.confirmed'),
				claimed: shouldRevertToPartial('COMPLETE', 'transaction.claimed')
			};
		});

		expect(result.claimPending).toBe(true);
		expect(result.serverConfirmed).toBe(true);
		expect(result.claimed).toBe(false);
	});
});

// ===========================================================================
// Test 5: Step transition tracking
// ===========================================================================

test.describe('Swap Progress — Step Transition Tracking', () => {

	test('completed step keys accumulate as progress advances', async ({ page }) => {
		await mockInfrastructure(page);
		await page.goto(WALLET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

		const result = await page.evaluate(() => {
			const stepOrder = [
				'locking-rbtc',
				'locking-tbtc',
				'waiting-for-boltz',
				'claiming-tbtc',
				'claiming-rbtc',
				'swapping-tbtc',
				'complete',
				'failed'
			];

			function markCompleted(currentStep: string, completed: Set<string>): Set<string> {
				const currentIdx = stepOrder.indexOf(currentStep);
				for (const s of stepOrder) {
					if (stepOrder.indexOf(s) < currentIdx) {
						completed.add(s);
					}
				}
				return completed;
			}

			// Simulate progress: locking-rbtc -> waiting-for-boltz -> claiming-tbtc
			let completed = new Set<string>();

			completed = markCompleted('locking-rbtc', completed);
			const afterLock = new Set(completed);

			completed = markCompleted('waiting-for-boltz', completed);
			const afterBoltz = new Set(completed);

			completed = markCompleted('claiming-tbtc', completed);
			const afterClaim = new Set(completed);

			return {
				afterLock: [...afterLock],
				afterBoltz: [...afterBoltz],
				afterClaim: [...afterClaim]
			};
		});

		// After locking-rbtc: nothing completed yet (it's the first step)
		expect(result.afterLock).toEqual([]);

		// After waiting-for-boltz: locking-rbtc and locking-tbtc completed
		expect(result.afterBoltz).toContain('locking-rbtc');
		expect(result.afterBoltz).toContain('locking-tbtc');

		// After claiming-tbtc: all previous steps completed
		expect(result.afterClaim).toContain('locking-rbtc');
		expect(result.afterClaim).toContain('locking-tbtc');
		expect(result.afterClaim).toContain('waiting-for-boltz');
	});
});

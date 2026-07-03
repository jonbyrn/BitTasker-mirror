import { test, expect } from '@playwright/test';

const TEST_NPUB = 'npub1rhswzjqtdny2v9s8hyy3s9r0phkun0jl5gahcdnutujf5g4j7zusp08gup';

test('skeleton — deep style inspection', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });

	// Measure at 200ms — skeleton should be visible
	await page.waitForTimeout(200);

	const result = await page.evaluate(() => {
		const outer = document.querySelector('.max-w-6xl') as HTMLElement | null;
		if (!outer) return { error: 'no .max-w-6xl found' };

		const cs = window.getComputedStyle(outer);
		const grid = outer.querySelector('.grid') as HTMLElement | null;
		const gridCs = grid ? window.getComputedStyle(grid) : null;

		// Check if lg: breakpoint is active
		const lgActive = window.matchMedia('(min-width: 1024px)').matches;

		// Check actual max-width value
		const testEl = document.createElement('div');
		testEl.className = 'max-w-6xl';
		document.body.appendChild(testEl);
		const testCs = window.getComputedStyle(testEl);
		const testMaxW = testCs.maxWidth;
		const testW = testEl.getBoundingClientRect().width;
		document.body.removeChild(testEl);

		return {
			outerRect: outer.getBoundingClientRect().width,
			outerMaxWidth: cs.maxWidth,
			outerWidth: cs.width,
			outerDisplay: cs.display,
			outerBoxSizing: cs.boxSizing,
			gridRect: grid?.getBoundingClientRect().width,
			gridDisplay: gridCs?.display,
			gridTemplateColumns: gridCs?.gridTemplateColumns,
			lgBreakpointActive: lgActive,
			testElementMaxW: testMaxW,
			testElementW: testW,
			outerClass: outer.className
		};
	});

	console.log('=== SKELETON AT 200ms ===');
	console.log(JSON.stringify(result, null, 2));

	// Now measure at 12 seconds — content loaded
	await page.waitForTimeout(12000);

	const contentResult = await page.evaluate(() => {
		const outer = document.querySelector('.max-w-6xl') as HTMLElement | null;
		if (!outer) return { error: 'no .max-w-6xl found' };

		const cs = window.getComputedStyle(outer);
		const grid = outer.querySelector('.grid') as HTMLElement | null;
		const gridCs = grid ? window.getComputedStyle(grid) : null;
		const lgActive = window.matchMedia('(min-width: 1024px)').matches;

		return {
			outerRect: outer.getBoundingClientRect().width,
			outerMaxWidth: cs.maxWidth,
			outerWidth: cs.width,
			gridRect: grid?.getBoundingClientRect().width,
			gridDisplay: gridCs?.display,
			gridTemplateColumns: gridCs?.gridTemplateColumns,
			lgBreakpointActive: lgActive,
			outerClass: outer.className
		};
	});

	console.log('\n=== CONTENT AT 12s ===');
	console.log(JSON.stringify(contentResult, null, 2));

	expect(result).toBeTruthy();
});

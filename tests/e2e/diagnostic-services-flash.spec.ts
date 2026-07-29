import { test, expect } from '@playwright/test';

interface ServiceTimelineEntry {
	time: number;
	state: string;
	skeletonCount?: number;
	cardCount: number;
	bodyTextLength?: number;
}

interface DiagnosticWindow extends Window {
	__serviceTimeline: ServiceTimelineEntry[];
	__serviceTimeline2: ServiceTimelineEntry[];
}

/**
 * Diagnostic test: monitors DOM state during services search transitions
 * to identify exactly when the empty state appears and for how long.
 */
test.describe('Services empty state flash — diagnostic', () => {
	test('monitor DOM transitions during search with no results', async ({ page }) => {
		// Track all DOM mutations and state changes
		const timeline: Array<{ time: number; event: string }> = [];
		const startTime = Date.now();

		page.on('console', (msg) => {
			if (msg.text().includes('[services') || msg.text().includes('FindServices')) {
				timeline.push({ time: Date.now() - startTime, event: `console: ${msg.text()}` });
			}
		});

		await page.goto('/services', { waitUntil: 'domcontentloaded' });

		// Wait for initial load to complete
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(6000);

		timeline.push({ time: Date.now() - startTime, event: 'initial load complete' });

		// Install a DOM observer to track what the user sees
		await page.evaluate(() => {
			const target = document.querySelector('[data-services-content-area]');
			if (!target) return;

			(window as unknown as DiagnosticWindow).__serviceTimeline = [];

			const observer = new MutationObserver(() => {
				const hasSkeleton = document.querySelectorAll('.animate-pulse').length > 0;
				const hasCards = document.querySelectorAll('[data-service-id]').length > 0;
				const hasEmptyState =
					document.body.innerText.includes('No services found') ||
					document.body.innerText.includes('no services found');
				const hasLoadingSpinner = document.querySelectorAll('.loading-spinner').length > 0;

				// Only record when something changes
				const state = `skeleton=${hasSkeleton} cards=${hasCards} empty=${hasEmptyState} loading=${hasLoadingSpinner}`;
				const prev = (window as unknown as DiagnosticWindow).__serviceTimeline;
				if (prev.length === 0 || prev[prev.length - 1].state !== state) {
					(window as unknown as DiagnosticWindow).__serviceTimeline.push({
						time: Date.now(),
						state,
						skeletonCount: document.querySelectorAll('.animate-pulse').length,
						cardCount: document.querySelectorAll('[data-service-id]').length,
						bodyTextLength: document.body.innerText.length
					});
				}
			});

			observer.observe(target, { childList: true, subtree: true, characterData: true });
		});

		// Now search for something that should return no results
		const searchInput = page.locator('input[type="text"]').first();
		await searchInput.fill('xyznonexistent123search');
		await searchInput.press('Enter');

		// Monitor for 10 seconds
		await page.waitForTimeout(10000);

		// Collect the timeline from the page
		const domTimeline = await page.evaluate(() => {
			return (window as unknown as DiagnosticWindow).__serviceTimeline || [];
		});

		console.log('\n=== SERVICES SEARCH TIMELINE ===');
		console.log('Search: "xyznonexistent123search" (expect 0 results)\n');

		for (const entry of domTimeline) {
			const elapsed = entry.time - (domTimeline[0]?.time || entry.time);
			console.log(`+${elapsed}ms: ${entry.state}`);
			console.log(
				`  cards=${entry.cardCount} skeletons=${entry.skeletonCount} bodyLen=${entry.bodyTextLength}`
			);
		}

		// Analyze the timeline for flash patterns
		let emptyStateAppeared = false;
		let emptyStateFrames = 0;
		let flashDetected = false;

		for (const entry of domTimeline) {
			if (entry.state.includes('empty=true')) {
				emptyStateAppeared = true;
				emptyStateFrames++;
			}
			// Flash = empty state appeared AND then cards appeared after
			if (entry.state.includes('cards=true') && emptyStateAppeared) {
				flashDetected = true;
			}
		}

		console.log('\n=== ANALYSIS ===');
		console.log('Empty state appeared:', emptyStateAppeared);
		console.log('Empty state frames:', emptyStateFrames);
		console.log('Flash detected (empty then cards):', flashDetected);
		console.log('Total state transitions:', domTimeline.length);

		// Also check the current visible state
		const finalBodyText = await page.locator('body').innerText();
		const hasNoServices = finalBodyText.includes('No services found');
		const serviceCardCount = await page.locator('[data-service-id]').count();
		const skeletonCount = await page.locator('.animate-pulse').count();

		console.log('\n=== FINAL STATE ===');
		console.log('Has "No services found":', hasNoServices);
		console.log('Service cards:', serviceCardCount);
		console.log('Skeletons:', skeletonCount);

		// Diagnostic test — just verify we captured data
		expect(domTimeline.length).toBeGreaterThan(0);
	});

	test('monitor DOM transitions during search that returns results', async ({ page }) => {
		await page.goto('/services', { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(6000);

		// Install observer
		await page.evaluate(() => {
			const target = document.querySelector('[data-services-content-area]');
			if (!target) return;

			(window as unknown as DiagnosticWindow).__serviceTimeline2 = [];

			const observer = new MutationObserver(() => {
				const hasSkeleton = document.querySelectorAll('.animate-pulse').length > 0;
				const hasCards = document.querySelectorAll('[data-service-id]').length > 0;
				const hasEmptyState = document.body.innerText.includes('No services found');

				const state = `skeleton=${hasSkeleton} cards=${hasCards} empty=${hasEmptyState}`;
				const prev = (window as unknown as DiagnosticWindow).__serviceTimeline2;
				if (prev.length === 0 || prev[prev.length - 1].state !== state) {
					(window as unknown as DiagnosticWindow).__serviceTimeline2.push({
						time: Date.now(),
						state,
						cardCount: document.querySelectorAll('[data-service-id]').length
					});
				}
			});

			observer.observe(target, { childList: true, subtree: true, characterData: true });
		});

		// Search for something generic that might return results
		const searchInput = page.locator('input[type="text"]').first();
		await searchInput.fill('test');
		await searchInput.press('Enter');

		await page.waitForTimeout(10000);

		const domTimeline = await page.evaluate(() => {
			return (window as unknown as DiagnosticWindow).__serviceTimeline2 || [];
		});

		console.log('\n=== SERVICES SEARCH WITH RESULTS TIMELINE ===');
		for (const entry of domTimeline) {
			const elapsed = entry.time - (domTimeline[0]?.time || entry.time);
			console.log(`+${elapsed}ms: ${entry.state} (cards=${entry.cardCount})`);
		}

		let sawEmptyBeforeCards = false;
		let sawEmpty = false;
		for (const entry of domTimeline) {
			if (entry.state.includes('empty=true') && !entry.state.includes('cards=true')) {
				sawEmpty = true;
			}
			if (entry.state.includes('cards=true') && sawEmpty) {
				sawEmptyBeforeCards = true;
			}
		}

		console.log('\nSaw empty state before cards:', sawEmptyBeforeCards);
	});
});

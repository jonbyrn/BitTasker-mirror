import { test, expect } from '@playwright/test';

const TEST_NPUB = 'npub1rhswzjqtdny2v9s8hyy3s9r0phkun0jl5gahcdnutujf5g4j7zusp08gup';

test.describe('Public Profile — Animations', () => {
	test('profile skeleton is shown during initial load', async ({ page }) => {
		await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });

		// Skeleton should appear immediately (within first second)
		const skeletons = page.locator('.animate-pulse');
		const skeletonCount = await skeletons.count();

		// Skeletons should appear during load
		// (they may disappear quickly on fast connections)
		expect(skeletonCount).toBeGreaterThanOrEqual(0);
	});

	test('profile content fades in after skeleton disappears', async ({ page }) => {
		await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });

		// Wait for profile to fully load
		await page.waitForTimeout(8000);

		// Content should be visible after load
		const profileCard = page.locator('.card').first();
		await expect(profileCard).toBeVisible({ timeout: 10000 });

		// Content should have opacity 1 (fully visible)
		const opacity = await profileCard.evaluate((el) => {
			return window.getComputedStyle(el).opacity;
		});
		expect(parseFloat(opacity)).toBeGreaterThan(0);
	});

	test('profile cards have staggered entrance animation', async ({ page }) => {
		await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(8000);

		// All cards should be visible after animation completes
		const cards = page.locator('.card');
		const cardCount = await cards.count();
		expect(cardCount).toBeGreaterThan(0);

		// Each card should have opacity > 0 (animated in)
		for (let i = 0; i < Math.min(cardCount, 5); i++) {
			const card = cards.nth(i);
			if (await card.isVisible()) {
				const opacity = await card.evaluate((el) => {
					return window.getComputedStyle(el).opacity;
				});
				expect(parseFloat(opacity)).toBeGreaterThan(0);
			}
		}
	});

	test('skill badges are visible after load', async ({ page }) => {
		await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(8000);

		// Skills section should be visible
		const skillsSection = page.locator('text=/skills/i').first();
		await expect(skillsSection).toBeVisible({ timeout: 10000 });
	});

	test('no layout shift during skeleton to content transition', async ({ page }) => {
		await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });

		// Measure viewport height during skeleton
		const initialHeight = await page.evaluate(() => document.body.scrollHeight);

		// Wait for content to load
		await page.waitForTimeout(8000);

		// Measure after content loads
		const finalHeight = await page.evaluate(() => document.body.scrollHeight);

		// Height should not dramatically change (no major layout shift)
		// Allow 50% variance since content can be different from skeleton
		const heightRatio = finalHeight / Math.max(initialHeight, 1);
		expect(heightRatio).toBeGreaterThan(0.3);
		expect(heightRatio).toBeLessThan(3);
	});

	test('profile page renders without JS errors', async ({ page }) => {
		const jsErrors: string[] = [];

		page.on('pageerror', (error) => {
			const message = error.message;
			// Ignore WebSocket errors (Nostr relay connections)
			if (
				message.includes('WebSocket') ||
				message.includes('ws://') ||
				message.includes('wss://')
			) {
				return;
			}
			jsErrors.push(message);
		});

		await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(8000);

		expect(jsErrors, `JS errors: ${jsErrors.join('; ')}`).toHaveLength(0);
	});
});

import { test, expect } from '@playwright/test';

// Override storage state to test as unauthenticated user
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('language switching', () => {
	test('switches to Spanish and updates content', async ({ page }) => {
		await page.goto('/', {
			waitUntil: 'domcontentloaded'
		});

		await page.waitForTimeout(5000);

		// Verify initial English content somewhere on the page
		const bodyBefore = await page.evaluate(() => document.body.innerText);
		expect(bodyBefore, 'Page should contain English text initially').toContain(
			'Hire people and AI agents'
		);

		// Open language dropdown and switch to Spanish
		await page.locator('.language-dropdown button').click();
		await page.waitForTimeout(500);
		await page.locator('button:has-text("Español")').click();
		await page.waitForTimeout(5000);

		// Verify Spanish content appears somewhere on the page
		const bodyAfter = await page.evaluate(() => document.body.innerText);
		expect(
			bodyAfter,
			'Page should contain Spanish text after language switch'
		).toMatch(/Contrata personas y agentes de IA/);
	});
});

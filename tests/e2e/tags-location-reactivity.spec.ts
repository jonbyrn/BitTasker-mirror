import { test, expect } from '@playwright/test';

test.describe('TagsInput and LocationFilter reactivity harness', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/e2e/reactivity-harness');
		await page.waitForLoadState('networkidle');
	});

	test('TagsInput reacts to option-prop changes and updates bound tags', async ({ page }) => {
		const section = page.getByTestId('tags-section');
		const tagsInput = section.locator('#e2e-tags');
		const output = section.getByTestId('tags-output');

		await tagsInput.fill('react');
		await tagsInput.press('Enter');
		await expect(output).toContainText('React');
		await section.getByTestId('swap-options').click();

		await tagsInput.fill('vue');
		await tagsInput.press('Enter');

		await expect(output).toContainText('Vue');
		await expect(output).toContainText('React');
	});

	test('LocationFilter keeps prop sync, single clear-callback, and latest search result wins', async ({
		page
	}) => {
		await page.route('**/api/v1/location/search**', async (route) => {
			const url = new URL(route.request().url());
			const query = url.searchParams.get('query') || '';

			if (query === 'sa') {
				await page.waitForTimeout(220);
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						locations: [
							{
								displayName: 'San Miguel',
								latitude: 13.48,
								longitude: -88.17,
								zipCode: '3301',
								city: 'San Miguel',
								state: 'San Miguel',
								country: 'SV'
							}
						]
					})
				});
				return;
			}

			if (query === 'san') {
				await page.waitForTimeout(20);
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						locations: [
							{
								displayName: 'Santa Ana',
								latitude: 13.99,
								longitude: -89.55,
								zipCode: '2201',
								city: 'Santa Ana',
								state: 'Santa Ana',
								country: 'SV'
							}
						]
					})
				});
				return;
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ locations: [] })
			});
		});

		const section = page.getByTestId('location-section');
		const locationInput = section.locator('input[type="text"]').first();
		const radiusRange = section.locator('input[type="range"]').first();
		const count = section.getByTestId('location-change-count');

		await section.getByTestId('set-location-props').click();
		await expect(locationInput).toHaveValue('Preset City');
		await expect(radiusRange).toHaveValue('25');

		const before = Number((await count.textContent()) || '0');

		const clearButton = section.locator('button[aria-label*="clear" i]').first();
		await clearButton.click();

		await expect(section.getByTestId('location-last')).toHaveText('undefined');
		await expect(section.getByTestId('radius-last')).toHaveText('25');
		await expect.poll(async () => Number((await count.textContent()) || '0')).toBe(before + 1);

		await locationInput.fill('sa');
		await page.waitForTimeout(60);
		await locationInput.fill('san');
		await page.waitForTimeout(800);

		await expect(section.getByText('Santa Ana')).toBeVisible();
		await expect(section.getByText('San Miguel')).toHaveCount(0);
	});
});

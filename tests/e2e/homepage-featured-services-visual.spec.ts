import { expect, test, type Page } from '@playwright/test';

test.describe('homepage featured visual snapshots', () => {
	test.use({ viewport: { width: 1440, height: 1200 } });

	test('matches the featured services loading shell', async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'Visual baselines are pinned on Chromium.');

		await stallHomepageFeaturedRequests(page);
		await page.goto('/');
		await page.addStyleTag({
			content: `
				*,
				*::before,
				*::after {
					animation: none !important;
					transition: none !important;
					caret-color: transparent !important;
				}
			`
		});

		const servicesSection = page.getByTestId('homepage-featured-services');
		await expect(servicesSection).toBeVisible();
		await expect(servicesSection).toHaveAttribute('aria-busy', 'true');
		await expect(servicesSection.getByTestId('homepage-featured-services-skeletons')).toBeVisible();

		await expect(servicesSection).toHaveScreenshot('homepage-featured-services-loading-shell-chromium.png', {
			animations: 'disabled',
			caret: 'hide'
		});
	});
});

async function stallHomepageFeaturedRequests(page: Page) {
	const holdOpen = new Promise<never>(() => {});

	await page.route('**/api/v1/events/request', async (route) => {
		await holdOpen;
	});

	await page.route('**/api/v1/events**', async (route) => {
		await holdOpen;
	});
}

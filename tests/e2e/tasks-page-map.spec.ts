import { test, expect } from '@playwright/test';
import { mockTasksEventsApi } from './fixtures/tasks-api-mock';
import { TasksPage } from './page-objects/tasks-page.po';

test.describe('Tasks Page Map - Logged Out', () => {
	test.beforeEach(async ({ page }) => {
		await mockTasksEventsApi(page, { mode: 'happy' });
	});

	test('desktop map column renders', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await tasksPage.gotoLoggedOut();

		await expect(tasksPage.mapColumn).toBeVisible({ timeout: 10_000 });
	});

	test('mobile view toggle switches to map view', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await tasksPage.gotoLoggedOut();

		await expect(tasksPage.viewToggleButton).toBeVisible();
		await tasksPage.viewToggleButton.click();

		await expect
			.poll(
				async () =>
					(await tasksPage.mobileMapView.isVisible().catch(() => false)) ||
					(await tasksPage.mapColumn.isVisible().catch(() => false)),
				{ timeout: 10_000 }
			)
			.toBe(true);
	});

	test('map InfoWindow action handler is registered after map init', async ({ page }) => {
		test.skip(!process.env.CI, 'Runs in CI only: depends on stable Google Maps marker runtime');
		const tasksPage = new TasksPage(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await tasksPage.gotoLoggedOut();
		await expect(tasksPage.mapColumn).toBeVisible({ timeout: 10_000 });
		await tasksPage.waitForPrimaryState();
		await expect(tasksPage.firstTaskCard).toBeVisible();

		const googleMapsRuntimeReady = await expect
			.poll(
				async () =>
					page.evaluate(() => {
						const maybeGoogle = (window as Window & { google?: { maps?: unknown } }).google;
						return !!maybeGoogle?.maps;
					}),
				{ timeout: 3_000 }
			)
			.toBe(true)
			.then(() => true)
			.catch(() => false);
		expect(googleMapsRuntimeReady, 'Google Maps runtime must be available in CI').toBeTruthy();

		await expect
			.poll(
				async () =>
					page.evaluate(() => {
						return (
							typeof (window as Window & { handleMapInfoWindowAction?: unknown })
								.handleMapInfoWindowAction === 'function'
						);
					}),
				{ timeout: 12_000 }
			)
			.toBe(true);
	});
});

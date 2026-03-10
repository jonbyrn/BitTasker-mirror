import { test, expect } from '@playwright/test';
import { mockTasksEventsApi } from './fixtures/tasks-api-mock';
import { TasksPage } from './page-objects/tasks-page.po';

test.describe('Tasks Page Smoke - Logged Out', () => {
	test.beforeEach(async ({ page }) => {
		await mockTasksEventsApi(page, { mode: 'happy' });
	});

	test('loads shell controls with expected accessibility hooks', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		await tasksPage.gotoLoggedOut();

		await expect(tasksPage.controls).toBeVisible();
		await expect(tasksPage.actionsNav).toBeVisible();
		await expect(tasksPage.searchInput).toBeVisible();
		await expect(tasksPage.searchIcon).toBeVisible();
		await expect(tasksPage.filtersButton).toHaveAttribute('aria-label', /.+/);
		await expect(tasksPage.saveSearchButton).toHaveAttribute('aria-label', /.+/);
	});

	test('search input accepts typing and clearing', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		await tasksPage.gotoLoggedOut();

		await tasksPage.searchInput.fill('deterministic query');
		await expect(tasksPage.searchInput).toHaveValue('deterministic query');
		await tasksPage.searchInput.clear();
		await expect(tasksPage.searchInput).toHaveValue('');
	});

	test('save search redirects logged-out users to signup', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		await tasksPage.gotoLoggedOut();

		await tasksPage.saveSearchButton.click();
		await expect(page).toHaveURL(/\/auth\/signup(?:[/?#].*)?$/);
	});

	test('mobile map/list toggle is visible and changes label', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await tasksPage.gotoLoggedOut();

		await expect(tasksPage.viewToggleButton).toBeVisible();
		const before = (await tasksPage.viewToggleButton.textContent())?.trim() ?? '';
		await tasksPage.viewToggleButton.click();
		await expect
			.poll(async () => ((await tasksPage.viewToggleButton.textContent()) ?? '').trim())
			.not.toBe(before);
	});

	test('desktop layout hides map/list toggle', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await tasksPage.gotoLoggedOut();

		await expect(tasksPage.viewToggleButton).toBeHidden();
	});

	test('critical path: search → filter drawer → task drawer → bid redirect', async ({ page }) => {
		test.setTimeout(45_000);
		const tasksPage = new TasksPage(page);
		await tasksPage.gotoLoggedOut();

		await tasksPage.searchInput.fill('mock');
		await expect(tasksPage.searchInput).toHaveValue('mock');

		await tasksPage.openFilterDrawer();
		await tasksPage.closeFilterDrawer();

		await expect(tasksPage.firstViewTaskButton).toBeVisible();
		const opened = await tasksPage.openTaskDrawerFromFirstCard();
		expect(opened).toBeTruthy();
		await tasksPage.closeTaskDrawer();

		await expect(tasksPage.firstEnabledBidButton).toBeVisible();
		await tasksPage.firstEnabledBidButton.click();
		await expect(page).toHaveURL(/\/auth\/signup(?:[/?#].*)?$/);
	});
});

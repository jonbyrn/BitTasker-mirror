import { test, expect } from '@playwright/test';
import { mockTasksEventsApi } from './fixtures/tasks-api-mock';
import { TasksPage } from './page-objects/tasks-page.po';

test.describe('Tasks Page States - Logged Out', () => {
	test('shows loading indicator while tasks API is pending', async ({ page }) => {
		await mockTasksEventsApi(page, { mode: 'slow', delayMs: 2_500 });
		await page.addInitScript(() => {
			window.localStorage.clear();
			window.sessionStorage.clear();
		});
		const tasksPage = new TasksPage(page);
		await tasksPage.gotoLoggedOut();

		await expect
			.poll(
				async () =>
					(await tasksPage.loadingState.isVisible().catch(() => false)) ||
					(await tasksPage.listSkeleton.isVisible().catch(() => false)),
				{ timeout: 6_000 }
			)
			.toBe(true);
		await tasksPage.waitForPrimaryState();
	});

	test('shows no results state when tasks API returns empty data', async ({ page }) => {
		await mockTasksEventsApi(page, { mode: 'empty' });
		const tasksPage = new TasksPage(page);
		await tasksPage.gotoLoggedOut();
		await tasksPage.waitForPrimaryState();

		await expect(tasksPage.noResultsState).toBeVisible();
		await expect(tasksPage.taskCards).toHaveCount(0);
	});

	test('exits loading state when tasks API errors', async ({ page }) => {
		await mockTasksEventsApi(page, { mode: 'error' });
		const tasksPage = new TasksPage(page);
		await tasksPage.gotoLoggedOut();

		await expect(tasksPage.listSkeleton).toBeHidden({ timeout: 8_000 });
		await expect(tasksPage.loadingState).toBeHidden({ timeout: 8_000 });
		await expect
			.poll(
				async () =>
					(await tasksPage.noResultsState.isVisible().catch(() => false)) ||
					(await tasksPage.errorState.isVisible().catch(() => false)) ||
					(await tasksPage.errorAlert.isVisible().catch(() => false)),
				{ timeout: 5_000 }
			)
			.toBeTruthy();
	});
});

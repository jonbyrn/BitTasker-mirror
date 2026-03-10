import { test, expect } from '@playwright/test';
import { mockTasksEventsApi } from './fixtures/tasks-api-mock';
import { TasksPage } from './page-objects/tasks-page.po';

test.describe('Tasks Page Drawers - Logged Out', () => {
	test.beforeEach(async ({ page }) => {
		await mockTasksEventsApi(page, { mode: 'happy' });
		const tasksPage = new TasksPage(page);
		await tasksPage.gotoLoggedOut();
		await tasksPage.waitForPrimaryState();
	});

	test('filter drawer opens and closes cleanly', async ({ page }) => {
		const tasksPage = new TasksPage(page);

		await tasksPage.openFilterDrawer();
		await expect(tasksPage.filterDrawer).toHaveAttribute('role', 'dialog');
		await expect(tasksPage.filterDrawer).toHaveAttribute('aria-modal', 'true');
		await tasksPage.closeFilterDrawer();
	});

	test('task drawer opens and closes when a task action is available', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		const opened = await tasksPage.openTaskDrawerFromFirstCard();
		expect(opened).toBeTruthy();

		await expect(tasksPage.taskDrawer).toHaveAttribute('role', 'dialog');
		await expect(tasksPage.taskDrawer).toHaveAttribute('aria-modal', 'true');
		await tasksPage.closeTaskDrawer();
	});

	test('bid action redirects logged-out users to signup when bid is enabled', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		const enabledBid = tasksPage.firstEnabledBidButton;
		await expect(enabledBid).toBeVisible();

		await enabledBid.click();
		await expect(page).toHaveURL(/\/auth\/signup(?:[/?#].*)?$/);
	});
});

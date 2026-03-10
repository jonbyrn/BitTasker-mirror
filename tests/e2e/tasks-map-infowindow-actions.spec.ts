import { test, expect } from '@playwright/test';
import { mockTasksEventsApi } from './fixtures/tasks-api-mock';
import { TasksPage } from './page-objects/tasks-page.po';

test.describe('Tasks map InfoWindow actions', () => {
	test.beforeEach(async ({ page }) => {
		await mockTasksEventsApi(page, { mode: 'happy' });
	});

	test('view action from map InfoWindow opens task drawer', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await tasksPage.gotoLoggedOut();

		await expect(tasksPage.mapColumn).toBeVisible({ timeout: 12_000 });
		await tasksPage.waitForPrimaryState();
		await expect(tasksPage.firstTaskCard).toBeVisible({ timeout: 12_000 });

		const markerImage = page.locator('img[src="/map-pin.png"]').first();
		await expect(markerImage).toBeVisible({ timeout: 20_000 });
		await markerImage.click({ force: true });

		const viewActionButton = page.locator('button[data-action="view"]').first();
		await expect(viewActionButton).toBeVisible({ timeout: 12_000 });
		await viewActionButton.click({ force: true });

		await expect(tasksPage.taskDrawer).toBeVisible({ timeout: 12_000 });
	});
});

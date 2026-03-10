import { test, expect } from '@playwright/test';
import { mockTasksEventsApi } from './fixtures/tasks-api-mock';
import { TasksPage } from './page-objects/tasks-page.po';

type ViewportCase = {
	name: 'mobile' | 'tablet' | 'desktop';
	width: number;
	height: number;
	expectToggleVisible: boolean;
};

const VIEWPORTS: ViewportCase[] = [
	{ name: 'mobile', width: 390, height: 844, expectToggleVisible: true },
	{ name: 'tablet', width: 768, height: 1024, expectToggleVisible: true },
	{ name: 'desktop', width: 1440, height: 900, expectToggleVisible: false }
];

test.describe('Tasks Page Responsive - Logged Out', () => {
	test.beforeEach(async ({ page }) => {
		await mockTasksEventsApi(page, { mode: 'happy' });
	});

	for (const viewport of VIEWPORTS) {
		test(`core controls render on ${viewport.name}`, async ({ page }) => {
			const tasksPage = new TasksPage(page);
			await page.setViewportSize({ width: viewport.width, height: viewport.height });
			await tasksPage.gotoLoggedOut();

			await expect(tasksPage.controls).toBeVisible();
			await expect(tasksPage.actionsNav).toBeVisible();
			await expect(tasksPage.searchInput).toBeVisible();
			await expect(tasksPage.filtersButton).toBeVisible();
			if (viewport.expectToggleVisible) {
				await expect(tasksPage.viewToggleButton).toBeVisible();
			} else {
				await expect(tasksPage.viewToggleButton).toBeHidden();
			}
		});
	}

	test('scroll-to-top appears on mobile after scrolling and returns list to top', async ({ page }) => {
		const tasksPage = new TasksPage(page);
		await page.setViewportSize({ width: 390, height: 844 });
		await tasksPage.gotoLoggedOut();

		await expect(tasksPage.scrollContainer).toBeVisible();
		await tasksPage.scrollContainer.evaluate((el) => {
			el.scrollTop = 700;
		});

		await expect(tasksPage.scrollToTopButton).toBeVisible({ timeout: 3_000 });
		await tasksPage.scrollToTopButton.click();

		await expect
			.poll(async () => tasksPage.scrollContainer.evaluate((el) => el.scrollTop))
			.toBeLessThan(120);
	});
});

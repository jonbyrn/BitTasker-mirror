import { test, expect, type Page } from '@playwright/test';

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const TASKS_PATH = /\/tasks(?:\?.*)?$/;

function escapeForRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getOutsideTapPoint(page: Page): Promise<{ x: number; y: number }> {
	const bodyBox = await page.locator('body').boundingBox();
	if (!bodyBox) {
		return { x: 20, y: 20 };
	}

	return {
		x: Math.max(20, Math.floor(bodyBox.width - 20)),
		y: Math.max(20, Math.floor(bodyBox.height - 20))
	};
}

async function openLanguageDropdown(page: Page) {
	const trigger = page.locator('.navbar-start [data-tip], [data-tip]').first();
	const languageDropdown = trigger.locator('xpath=ancestor::details[1]');
	const spanishOptionImage = page.locator('img[alt="Español flag"]').first();

	await expect(trigger).toBeVisible({ timeout: 15000 });
	await trigger.click();
	if (!(await spanishOptionImage.isVisible().catch(() => false))) {
		await trigger.press('Enter');
	}
	await expect(spanishOptionImage).toBeVisible();

	return { languageDropdown, trigger, spanishOptionImage };
}

async function closeByOutsideTap(page: Page) {
	const point = await getOutsideTapPoint(page);
	await page.mouse.click(point.x, point.y);
}

test.describe('WebKit dropdown diagnostics (logged out)', () => {
	test.beforeEach(async ({ page }) => {
		await page.context().clearCookies();
		await page.setViewportSize(DESKTOP_VIEWPORT);
		await page.goto('/tasks', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');
		await expect(page).toHaveURL(TASKS_PATH);
		await expect(page.locator('.navbar').first()).toBeVisible();
	});

	test('language dropdown opens and closes on outside tap', async ({ page, browserName }) => {
		test.skip(browserName !== 'webkit', 'WebKit diagnostics only');

		const { spanishOptionImage } = await openLanguageDropdown(page);

		await closeByOutsideTap(page);
		await expect(spanishOptionImage).not.toBeVisible();
	});

	test('top-center menu dropdown item navigates when center navbar is visible', async ({ page, browserName }) => {
		test.skip(browserName !== 'webkit', 'WebKit diagnostics only');

		const navbarCenter = page.locator('.navbar-center').first();
		const sectionButton = page.locator('#menu-button-for-taskers').first();

		const canRun = (await navbarCenter.isVisible().catch(() => false)) && (await sectionButton.isVisible().catch(() => false));
		test.skip(!canRun, 'Center navbar is not visible at this viewport/project configuration');

		await sectionButton.click();

		const menuContainer = sectionButton.locator('xpath=ancestor::li[1]');
		const openMenu = menuContainer.locator('[role="menu"]').first();
		const targetMenuLink = openMenu.locator('a[href="/tasker-fees"], a[href="/secure-payments"], a[href="/faq"]').first();

		await expect(openMenu).toBeVisible();
		await expect(targetMenuLink).toBeVisible();

		const href = await targetMenuLink.getAttribute('href');
		expect(href).toBeTruthy();

		if (!href) {
			return;
		}

		await targetMenuLink.click();
		await expect(page).toHaveURL(new RegExp(`${escapeForRegex(href)}(?:[/?#].*)?$`));
	});

	test('language dropdown stress: 5 open-close cycles leave no stuck-open state', async ({ page, browserName }) => {
		test.skip(browserName !== 'webkit', 'WebKit diagnostics only');

		const trigger = page.locator('.navbar-start [data-tip], [data-tip]').first();
		const spanishOptionImage = page.locator('img[alt="Español flag"]').first();

		await expect(trigger).toBeVisible({ timeout: 15000 });

		for (let i = 0; i < 5; i += 1) {
			await trigger.click();
			if (!(await spanishOptionImage.isVisible().catch(() => false))) {
				await trigger.press('Enter');
			}
			await expect(spanishOptionImage).toBeVisible();

			await closeByOutsideTap(page);
			await expect(spanishOptionImage).not.toBeVisible();
		}

		await expect(spanishOptionImage).not.toBeVisible();
	});
});

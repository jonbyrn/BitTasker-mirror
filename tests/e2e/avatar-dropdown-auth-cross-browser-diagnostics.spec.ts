import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';
import type { Locator, Page } from '@playwright/test';

test.use({ credentialLabel: 'signup' });

function avatarDropdownMenu(page: Page): Locator {
	return page.locator('.navbar-end [role="menu"]').last();
}

async function findVisibleAvatarTrigger(page: Page): Promise<Locator | null> {
	const candidates = page.locator('.navbar .navbar-end button');
	const count = await candidates.count();
	const visible: Locator[] = [];
	for (let i = 0; i < count; i += 1) {
		const candidate = candidates.nth(i);
		const isVisible = await candidate.isVisible().catch(() => false);
		const isEnabled = await candidate.isEnabled().catch(() => false);
		if (isVisible && isEnabled) {
			visible.push(candidate);
		}
	}
	return visible.length > 0 ? visible[visible.length - 1] : null;
}

async function assertCenterPointTargetsElement(page: Page, locator: Locator, label: string): Promise<void> {
	const box = await locator.boundingBox();
	expect(box, `${label} should have bounding box`).not.toBeNull();
	if (!box) return;

	const center = {
		x: box.x + box.width / 2,
		y: box.y + box.height / 2
	};

	const isTargeted = await locator.evaluate((el, point) => {
		const hit = document.elementFromPoint(point.x, point.y);
		if (!hit) return false;
		return hit === el || el.contains(hit);
	}, center);
	expect(isTargeted, `${label} center point is blocked by another element`).toBeTruthy();
}

async function openAvatarDropdown(page: Page): Promise<void> {
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(500);
	let trigger = await findVisibleAvatarTrigger(page);
	let triggerVisible = !!trigger;
	if (!triggerVisible) {
		await page.waitForTimeout(1500);
		trigger = await findVisibleAvatarTrigger(page);
		triggerVisible = !!trigger;
	}
	expect(triggerVisible, 'Avatar trigger should be visible on authenticated dashboard').toBeTruthy();
	if (!trigger) return;
	await assertCenterPointTargetsElement(page, trigger, 'Avatar trigger');
	await trigger.tap().catch(async () => {
		await trigger.click({ force: true });
	});
	await expect(avatarDropdownMenu(page)).toBeVisible({ timeout: 10_000 });
}

test.describe('Authenticated avatar dropdown diagnostics (cross-browser)', () => {
	test.describe.configure({ retries: 0 });
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	test('opens avatar dropdown from /dashboard topbar', async ({ authenticatedPageCrossBrowser }) => {
		const page = authenticatedPageCrossBrowser;
		await expect(page).toHaveURL(/\/dashboard/);
		await openAvatarDropdown(page);
	});

	test('closes avatar dropdown when tapping outside', async ({ authenticatedPageCrossBrowser }) => {
		const page = authenticatedPageCrossBrowser;
		await openAvatarDropdown(page);

		if (page.viewportSize()?.width && page.viewportSize()!.width <= 430) {
			await page.touchscreen.tap(5, 5);
		} else {
			await page.mouse.click(5, 5);
		}
		await expect(avatarDropdownMenu(page)).toHaveCount(0);
	});

	test('navigates from avatar dropdown using profile/settings links', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		await openAvatarDropdown(page);

		const profileLink = avatarDropdownMenu(page).locator('a[href="/dashboard/profile"]').first();
		if (await profileLink.isVisible().catch(() => false)) {
			await assertCenterPointTargetsElement(page, profileLink, 'Profile link');
			await profileLink.tap().catch(async () => {
				await profileLink.click({ force: true });
			});
			await expect(page).toHaveURL(/\/dashboard\/profile$/, { timeout: 15_000 });
			return;
		}

		const settingsLink = avatarDropdownMenu(page).locator('a[href="/dashboard/settings"]').first();
		await expect(settingsLink).toBeVisible({ timeout: 10_000 });
		await assertCenterPointTargetsElement(page, settingsLink, 'Settings link');
		await settingsLink.tap().catch(async () => {
			await settingsLink.click({ force: true });
		});
		await expect(page).toHaveURL(/\/dashboard\/settings$/, { timeout: 15_000 });
	});
});

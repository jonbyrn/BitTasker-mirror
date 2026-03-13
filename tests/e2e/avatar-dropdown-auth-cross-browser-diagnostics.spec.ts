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

function bottomNavOverlay(page: Page): Locator {
	return page.locator('.bottom-nav-overlay').first();
}

async function findVisibleAvatarTrigger(page: Page): Promise<Locator | null> {
	const candidates = page.locator(
		'.navbar-end .dropdown.dropdown-end > button[aria-haspopup="true"], .navbar-end button[aria-haspopup="true"][aria-expanded]'
	);
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

async function findVisibleBottomMenuTrigger(page: Page): Promise<Locator | null> {
	const candidates = page.locator('button[data-menu-button]');
	const count = await candidates.count();
	for (let i = 0; i < count; i += 1) {
		const candidate = candidates.nth(i);
		const isVisible = await candidate.isVisible().catch(() => false);
		const isEnabled = await candidate.isEnabled().catch(() => false);
		if (isVisible && isEnabled) return candidate;
	}
	return null;
}

async function assertCenterPointTargetsElement(
	page: Page,
	locator: Locator,
	label: string
): Promise<void> {
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

async function openAvatarDropdown(page: Page): Promise<'avatar' | 'bottom-nav'> {
	await page.waitForLoadState('load');
	await expect
		.poll(
			async () =>
				Boolean(
					(await findVisibleAvatarTrigger(page)) || (await findVisibleBottomMenuTrigger(page))
				),
			{ timeout: 12_000, intervals: [250, 500, 1000, 2000] }
		)
		.toBe(true);

	const avatarTrigger = await findVisibleAvatarTrigger(page);

	if (avatarTrigger) {
		await assertCenterPointTargetsElement(page, avatarTrigger, 'Avatar trigger');
		await avatarTrigger.tap().catch(async () => {
			await avatarTrigger.click({ force: true });
		});
		await expect(avatarDropdownMenu(page)).toBeVisible({ timeout: 10_000 });
		return 'avatar';
	}

	const bottomMenuTrigger = await findVisibleBottomMenuTrigger(page);
	expect(
		bottomMenuTrigger,
		'Neither topbar avatar trigger nor mobile bottom-nav menu trigger is available'
	).not.toBeNull();
	if (!bottomMenuTrigger) return 'bottom-nav';

	await bottomMenuTrigger.tap().catch(async () => {
		await bottomMenuTrigger.click({ force: true });
	});
	await expect(bottomNavOverlay(page)).toBeVisible({ timeout: 10_000 });
	return 'bottom-nav';
}

test.describe('Authenticated avatar dropdown diagnostics (cross-browser)', () => {
	test.describe.configure({ retries: 0 });
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	test('opens avatar dropdown from /dashboard topbar', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		await expect(page).toHaveURL(/\/dashboard/);
		const mode = await openAvatarDropdown(page);
		if (mode === 'bottom-nav') {
			await expect(
				bottomNavOverlay(page).locator('a[href="/dashboard/profile"]').first()
			).toBeVisible({
				timeout: 10_000
			});
		}
	});

	test('closes avatar dropdown when tapping outside', async ({ authenticatedPageCrossBrowser }) => {
		const page = authenticatedPageCrossBrowser;
		const mode = await openAvatarDropdown(page);

		if (mode === 'bottom-nav') {
			await page
				.locator('button.bottom-nav-backdrop')
				.first()
				.tap()
				.catch(async () => {
					await page.locator('button.bottom-nav-backdrop').first().click({ force: true });
				});
			await expect(bottomNavOverlay(page)).toHaveCount(0);
		} else {
			if (page.viewportSize()?.width && page.viewportSize()!.width <= 430) {
				await page.touchscreen.tap(5, 5);
			} else {
				await page.mouse.click(5, 5);
			}
			await expect(avatarDropdownMenu(page)).toHaveCount(0);
		}
	});

	test('navigates from avatar dropdown using profile/settings links', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		const mode = await openAvatarDropdown(page);

		if (mode === 'bottom-nav') {
			const profileLink = bottomNavOverlay(page).locator('a[href="/dashboard/profile"]').first();
			if (await profileLink.isVisible().catch(() => false)) {
				await profileLink.tap().catch(async () => {
					await profileLink.click({ force: true });
				});
				await expect(page).toHaveURL(/\/dashboard\/profile$/, { timeout: 15_000 });
				return;
			}
			const settingsLink = bottomNavOverlay(page).locator('a[href="/dashboard/settings"]').first();
			await expect(settingsLink).toBeVisible({ timeout: 10_000 });
			await settingsLink.tap().catch(async () => {
				await settingsLink.click({ force: true });
			});
			await expect(page).toHaveURL(/\/dashboard\/settings$/, { timeout: 15_000 });
			return;
		}

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

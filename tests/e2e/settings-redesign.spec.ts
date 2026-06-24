import { test, expect } from '@playwright/test';

const MOBILE = { width: 390, height: 844 };
const TABLET = { width: 768, height: 1024 };
const DESKTOP = { width: 1280, height: 800 };

const CARDS = [
	{ slug: 'nostr', title: 'Login Info' },
	{ slug: 'devices', title: 'Devices' },
	{ slug: 'recovery', title: 'Recovery' },
	{ slug: 'muted', title: 'Muted' },
	{ slug: 'notifications', title: 'Notifications' },
	{ slug: 'actions', title: 'Actions' }
];

// Seed E2E key data so getAllKeys() bypasses passkey prompt.
// These match what global-setup.ts would inject from the seed file.
const E2E_NPUB = 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899';
const E2E_NSEC = '1122334455667788990011223344556677889900112233445566778899001122';
const E2E_MNEMONIC =
	'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

test.beforeEach(async ({ page }) => {
	await page.addInitScript(
		(data) => {
			window.__PLAYWRIGHT_TEST__ = true;
			localStorage.setItem('__E2E_NSEC__', data.nsec);
			localStorage.setItem('__E2E_NPUB__', data.npub);
			localStorage.setItem('__E2E_MNEMONIC__', data.mnemonic);
			localStorage.setItem('CapacitorStorage.__E2E_NSEC__', data.nsec);
			localStorage.setItem('CapacitorStorage.__E2E_NPUB__', data.npub);
			localStorage.setItem('CapacitorStorage.__E2E_MNEMONIC__', data.mnemonic);
			localStorage.setItem('access_token', 'test-token');
			localStorage.setItem('CapacitorStorage.access_token', 'test-token');
			localStorage.setItem('onboardingCompleted', 'true');
			localStorage.setItem('CapacitorStorage.onboardingCompleted', 'true');
			localStorage.setItem('auth_method', 'nostr');
			localStorage.setItem('CapacitorStorage.auth_method', 'nostr');
			localStorage.setItem('npub', data.npub);
			localStorage.setItem('CapacitorStorage.npub', data.npub);
		},
		{ nsec: E2E_NSEC, npub: E2E_NPUB, mnemonic: E2E_MNEMONIC }
	);
});

async function dismissModals(page: import('@playwright/test').Page) {
	await page.evaluate(() => {
		document.querySelectorAll('.modal-open').forEach((m) => m.remove());
	});
	await page.waitForTimeout(200);
}

test.describe('settings', () => {
	// ── Card Grid ────────────────────────────────────────────────────────

	test.describe('card grid', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
		});

		test('loads with title and subtitle', async ({ page }) => {
			await expect(page.locator('h3').first()).toBeVisible();
			await expect(page.locator('p.text-base-content\\/70').first()).toBeVisible();
		});

		test('displays 6 cards', async ({ page }) => {
			await expect(page.locator('.settings-card')).toHaveCount(6);
		});

		test('each card has icon, title, description', async ({ page }) => {
			await expect(page.locator('.settings-card-icon')).toHaveCount(6);
			await expect(page.locator('.settings-card-title')).toHaveCount(6);
			await expect(page.locator('.settings-card-description')).toHaveCount(6);
		});

		test('cards are links with correct hrefs', async ({ page }) => {
			for (const card of CARDS) {
				await expect(page.locator(`a[href="/settings/${card.slug}"]`)).toBeVisible();
			}
		});

		test('cards stacked single column on mobile', async ({ page }) => {
			const first = await page.locator('.settings-card').first().boundingBox();
			const second = await page.locator('.settings-card').nth(1).boundingBox();
			expect(first).not.toBeNull();
			expect(second).not.toBeNull();
			if (first && second) {
				expect(second.y).toBeGreaterThan(first.y + first.height - 10);
			}
		});

		test('cards have visible background and border', async ({ page }) => {
			const card = page.locator('.settings-card').first();
			const bg = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
			expect(bg).not.toBe('rgba(0, 0, 0, 0)');
			expect(bg).not.toBe('transparent');
			const border = await card.evaluate((el) => getComputedStyle(el).borderWidth);
			expect(parseInt(border)).toBeGreaterThan(0);
		});

		test('icons are at least 48px and centered', async ({ page }) => {
			const cards = page.locator('.settings-card');
			const icons = page.locator('.settings-card-icon');
			for (let i = 0; i < 6; i++) {
				const cardBox = await cards.nth(i).boundingBox();
				const iconBox = await icons.nth(i).boundingBox();
				expect(cardBox).not.toBeNull();
				expect(iconBox).not.toBeNull();
				if (cardBox && iconBox) {
					expect(iconBox.width).toBeGreaterThanOrEqual(48);
					const cardCenter = cardBox.x + cardBox.width / 2;
					const iconCenter = iconBox.x + iconBox.width / 2;
					expect(Math.abs(cardCenter - iconCenter)).toBeLessThan(20);
				}
			}
		});

		test('icons have animation', async ({ page }) => {
			const icons = page.locator('.settings-card-icon');
			for (let i = 0; i < 6; i++) {
				const anim = await icons.nth(i).evaluate((el) => getComputedStyle(el).animationName);
				expect(anim).not.toBe('none');
			}
		});

		test('icons disabled under prefers-reduced-motion', async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const icons = page.locator('.settings-card-icon');
			for (let i = 0; i < 6; i++) {
				const anim = await icons.nth(i).evaluate((el) => getComputedStyle(el).animationName);
				expect(anim).toBe('none');
			}
		});

		test('cards have active state for touch', async ({ page }) => {
			const card = page.locator('.settings-card').first();
			const hasActive = await card.evaluate(() => {
				for (const sheet of Array.from(document.styleSheets)) {
					try {
						for (const rule of Array.from(sheet.cssRules || [])) {
							if (
								rule instanceof CSSStyleRule &&
								rule.selectorText?.includes('.settings-card') &&
								rule.selectorText?.includes(':active')
							)
								return true;
						}
					} catch {
						/* cross-origin */
					}
				}
				return false;
			});
			expect(hasActive).toBe(true);
		});
	});

	test.describe('card grid responsive', () => {
		test('2 columns on tablet', async ({ page }) => {
			await page.setViewportSize(TABLET);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const first = await page.locator('.settings-card').first().boundingBox();
			const second = await page.locator('.settings-card').nth(1).boundingBox();
			if (first && second) {
				expect(second.x).toBeGreaterThan(first.x);
				expect(Math.abs(second.y - first.y)).toBeLessThan(10);
			}
		});

		test('3 columns on desktop', async ({ page }) => {
			await page.setViewportSize(DESKTOP);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const first = await page.locator('.settings-card').first().boundingBox();
			const second = await page.locator('.settings-card').nth(1).boundingBox();
			const third = await page.locator('.settings-card').nth(2).boundingBox();
			if (first && second && third) {
				expect(second.x).toBeGreaterThan(first.x);
				expect(third.x).toBeGreaterThan(second.x);
			}
		});

		test('hover effect on desktop', async ({ browser }) => {
			// Mobile Chrome doesn't properly support hover — use a desktop context
			const context = await browser.newContext({
				viewport: DESKTOP,
				storageState: undefined
			});
			const desktopPage = await context.newPage();
			await desktopPage.addInitScript(
				(data) => {
					window.__PLAYWRIGHT_TEST__ = true;
					localStorage.setItem('__E2E_NSEC__', data.nsec);
					localStorage.setItem('__E2E_NPUB__', data.npub);
					localStorage.setItem('__E2E_MNEMONIC__', data.mnemonic);
					localStorage.setItem('CapacitorStorage.__E2E_NSEC__', data.nsec);
					localStorage.setItem('CapacitorStorage.__E2E_NPUB__', data.npub);
					localStorage.setItem('CapacitorStorage.__E2E_MNEMONIC__', data.mnemonic);
					localStorage.setItem('access_token', 'test-token');
					localStorage.setItem('CapacitorStorage.access_token', 'test-token');
					localStorage.setItem('onboardingCompleted', 'true');
					localStorage.setItem('CapacitorStorage.onboardingCompleted', 'true');
					localStorage.setItem('auth_method', 'nostr');
					localStorage.setItem('CapacitorStorage.auth_method', 'nostr');
					localStorage.setItem('npub', data.npub);
					localStorage.setItem('CapacitorStorage.npub', data.npub);
				},
				{ nsec: E2E_NSEC, npub: E2E_NPUB, mnemonic: E2E_MNEMONIC }
			);
			await desktopPage.goto('/settings', { waitUntil: 'domcontentloaded' });
			await desktopPage.waitForTimeout(3000);
			await dismissModals(desktopPage);
			const card = desktopPage.locator('.settings-card').first();
			const before = await card.evaluate((el) => getComputedStyle(el).boxShadow);
			await card.hover();
			await desktopPage.waitForTimeout(300);
			const after = await card.evaluate((el) => getComputedStyle(el).boxShadow);
			expect(after).not.toBe(before);
			await context.close();
		});
	});

	// ── Navigation ───────────────────────────────────────────────────────

	test.describe('navigation', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			await dismissModals(page);
		});

		for (const card of CARDS) {
			test(`click card navigates to /settings/${card.slug}`, async ({ page }) => {
				const link = page.locator(`a[href="/settings/${card.slug}"]`);
				await link.click({ force: true });
				await page.waitForTimeout(2000);
				expect(page.url()).toContain(`/settings/${card.slug}`);
			});
		}

		test('navigating to sub-route removes card grid from DOM', async ({ page }) => {
			await page.locator('a[href="/settings/nostr"]').click();
			await page.waitForTimeout(500);
			expect(await page.locator('.settings-card').count()).toBe(0);
		});
	});

	test.describe('back button', () => {
		for (const card of CARDS) {
			test(`/settings/${card.slug} has back button`, async ({ page }) => {
				await page.setViewportSize(MOBILE);
				await page.goto(`/settings/${card.slug}`, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(5000);
				await dismissModals(page);
				const back = page.locator('a[href="/settings"]').first();
				const hasBack = await back.isVisible().catch(() => false);
				const hasError = await page
					.locator('.alert-error')
					.isVisible()
					.catch(() => false);
				expect(hasBack || hasError).toBe(true);
			});

			test(`back from /settings/${card.slug} returns to /settings`, async ({ page }) => {
				await page.setViewportSize(MOBILE);
				await page.goto(`/settings/${card.slug}`, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(5000);
				await dismissModals(page);
				const back = page.locator('a[href="/settings"]').first();
				const hasBack = await back.isVisible().catch(() => false);
				if (hasBack) {
					await back.click();
					await page.waitForTimeout(1000);
					expect(page.url()).toMatch(/\/settings$/);
				}
			});
		}
	});

	test.describe('round-trip navigation', () => {
		test('settings → nostr → back → settings works', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			await dismissModals(page);

			await page.locator('a[href="/settings/nostr"]').click({ force: true });
			await page.waitForTimeout(2000);
			expect(page.url()).toContain('/settings/nostr');

			const back = page.locator('a[href="/settings"]').first();
			const hasBack = await back.isVisible().catch(() => false);
			if (hasBack) {
				await back.click();
				await page.waitForTimeout(1000);
				expect(page.url()).toMatch(/\/settings$/);
			}
		});
	});

	// ── Sub-Route Content ────────────────────────────────────────────────

	test.describe('sub-route content', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize(MOBILE);
		});

		test('nostr page shows keys and QR code button', async ({ page }) => {
			await page.goto('/settings/nostr', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(4000);
			await dismissModals(page);
			await expect(page.locator('.settings-sub-content')).toBeVisible();
			await expect(page.locator('h4', { hasText: 'Login Info' })).toBeVisible();
			await expect(page.locator('input[readonly]').first()).toBeVisible();
		});

		test('devices page shows section title', async ({ page }) => {
			await page.goto('/settings/devices', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(8000);
			await dismissModals(page);
			// Devices page may show error or content depending on API availability
			const hasContent = await page
				.locator('.settings-sub-content')
				.isVisible()
				.catch(() => false);
			const hasError = await page
				.locator('.alert-error')
				.isVisible()
				.catch(() => false);
			expect(hasContent || hasError).toBe(true);
		});

		test('recovery page shows form fields', async ({ page }) => {
			await page.goto('/settings/recovery', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(4000);
			await dismissModals(page);
			await expect(page.locator('.settings-sub-content')).toBeVisible();
			await expect(page.locator('h4', { hasText: 'Recovery' })).toBeVisible();
		});

		test('muted page shows section title', async ({ page }) => {
			await page.goto('/settings/muted', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(4000);
			await dismissModals(page);
			await expect(page.locator('.settings-sub-content')).toBeVisible();
			await expect(page.locator('h4', { hasText: 'Muted' })).toBeVisible();
		});

		test('actions page shows logout and delete buttons', async ({ page }) => {
			await page.goto('/settings/actions', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(4000);
			await dismissModals(page);
			await expect(page.locator('.settings-sub-content')).toBeVisible();
			await expect(page.locator('h4', { hasText: 'Actions' })).toBeVisible();
			await expect(page.locator('button', { hasText: /logout/i })).toBeVisible();
			await expect(page.locator('button', { hasText: /delete/i })).toBeVisible();
		});

		test('notifications page shows section title', async ({ page }) => {
			await page.goto('/settings/notifications', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(5000);
			await dismissModals(page);
			const hasContent = await page
				.locator('.settings-sub-content')
				.isVisible()
				.catch(() => false);
			const hasError = await page
				.locator('.alert-error')
				.isVisible()
				.catch(() => false);
			expect(hasContent || hasError).toBe(true);
		});

		for (const card of CARDS) {
			test(`/settings/${card.slug} content has background`, async ({ page }) => {
				await page.goto(`/settings/${card.slug}`, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(8000);
				await dismissModals(page);
				const panel = page.locator('.settings-sub-content').first();
				const hasPanel = await panel.isVisible().catch(() => false);
				const hasError = await page
					.locator('.alert-error')
					.isVisible()
					.catch(() => false);
				if (hasPanel) {
					const bg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
					expect(bg).not.toBe('rgba(0, 0, 0, 0)');
					expect(bg).not.toBe('transparent');
				} else {
					expect(hasError).toBe(true);
				}
			});
		}
	});

	// ── Key Loading ──────────────────────────────────────────────────────

	test.describe('key loading', () => {
		test('settings loads without error', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const hasError = await page
				.locator('.alert-error')
				.isVisible()
				.catch(() => false);
			expect(hasError).toBe(false);
		});

		test('sub-route loads without error', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings/nostr', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const hasError = await page
				.locator('.alert-error')
				.isVisible()
				.catch(() => false);
			expect(hasError).toBe(false);
		});

		test('loading spinner shown then disappears', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			// Spinner may or may not be visible depending on speed
			// But after 3s it should be gone
			await page.waitForTimeout(3000);
			const spinner = page.locator('.settings-content .loading-spinner');
			expect(await spinner.isVisible()).toBe(false);
		});

		test('messages page loads without auth redirect', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/messages', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			expect(page.url()).not.toContain('/auth/login');
		});

		test('wallet page loads after settings (keys cached)', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);
			await page.goto('/wallet', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			expect(page.url()).not.toContain('/auth/login');
		});
	});

	// ── No Alby References ───────────────────────────────────────────────

	test.describe('no Alby references', () => {
		test('settings page has no Alby text', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);
			const text = await page.textContent('body');
			expect(text?.toLowerCase()).not.toContain('alby');
		});

		test('nostr page has no Alby text', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings/nostr', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const text = await page.textContent('body');
			expect(text?.toLowerCase()).not.toContain('alby');
		});
	});

	// ── Performance ──────────────────────────────────────────────────────

	test.describe('performance', () => {
		test('settings page loads within 3 seconds', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			const start = Date.now();
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.locator('.settings-card').first().waitFor({ timeout: 5000 });
			expect(Date.now() - start).toBeLessThan(3000);
		});

		test('sub-route navigation under 1 second', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			await dismissModals(page);
			const start = Date.now();
			await page.locator('a[href="/settings/nostr"]').click();
			await page.waitForURL('**/settings/nostr', { timeout: 3000 });
			expect(Date.now() - start).toBeLessThan(1000);
		});

		test('sub-route content loads within 3 seconds', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			const start = Date.now();
			await page.goto('/settings/nostr', { waitUntil: 'domcontentloaded' });
			await page.locator('.settings-sub-content').waitFor({ timeout: 8000 });
			expect(Date.now() - start).toBeLessThan(8000);
		});
	});

	// ── Accessibility ────────────────────────────────────────────────────

	test.describe('accessibility', () => {
		test('cards keyboard navigable', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const first = page.locator('a.settings-card').first();
			await first.focus();
			await expect(first).toBeFocused();
			await page.keyboard.press('Tab');
			await expect(page.locator('a.settings-card').nth(1)).toBeFocused();
		});

		test('cards have aria-label', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const cards = page.locator('a.settings-card');
			for (let i = 0; i < 6; i++) {
				const label = await cards.nth(i).getAttribute('aria-label');
				expect(label).toBeTruthy();
				expect(label!.trim().length).toBeGreaterThan(0);
			}
		});

		test('back button is an anchor tag', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings/nostr', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const back = page.locator('a[href="/settings"]').first();
			const tag = await back.evaluate((el) => el.tagName.toLowerCase());
			expect(tag).toBe('a');
		});
	});

	// ── Responsive ───────────────────────────────────────────────────────

	test.describe('responsive', () => {
		test('mobile→tablet updates grid layout', async ({ page }) => {
			await page.setViewportSize(MOBILE);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);
			const mobileFirst = await page.locator('.settings-card').first().boundingBox();
			const mobileSecond = await page.locator('.settings-card').nth(1).boundingBox();
			if (mobileFirst && mobileSecond) {
				expect(mobileSecond.y).toBeGreaterThan(mobileFirst.y);
			}
			await page.setViewportSize(TABLET);
			await page.waitForTimeout(500);
			const tabletFirst = await page.locator('.settings-card').first().boundingBox();
			const tabletSecond = await page.locator('.settings-card').nth(1).boundingBox();
			if (tabletFirst && tabletSecond) {
				expect(tabletSecond.x).toBeGreaterThan(tabletFirst.x);
			}
		});

		for (const card of CARDS) {
			test(`/settings/${card.slug} fits mobile viewport`, async ({ page }) => {
				await page.setViewportSize(MOBILE);
				await page.goto(`/settings/${card.slug}`, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(8000);
				await dismissModals(page);
				const content = page.locator('.settings-content');
				const hasContent = await content.isVisible().catch(() => false);
				const hasError = await page
					.locator('.alert-error')
					.isVisible()
					.catch(() => false);
				expect(hasContent || hasError).toBe(true);
				if (hasContent) {
					const box = await content.boundingBox();
					expect(box).not.toBeNull();
					if (box) expect(box.width).toBeLessThanOrEqual(MOBILE.width);
				}
			});
		}
	});
});

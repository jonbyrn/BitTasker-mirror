import { test, expect } from './fixtures/cross-browser-auth';

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const TABLET_VIEWPORT = { width: 768, height: 1024 };
const DESKTOP_VIEWPORT = { width: 1280, height: 800 };

const SETTINGS_CARDS = [
	{ slug: 'nostr', titleKey: 'settings.cards.nostr.title' },
	{ slug: 'devices', titleKey: 'settings.cards.devices.title' },
	{ slug: 'recovery', titleKey: 'settings.cards.recovery.title' },
	{ slug: 'muted', titleKey: 'settings.cards.muted.title' },
	{ slug: 'actions', titleKey: 'settings.cards.actions.title' }
];

test.describe('settings page', () => {
	test.describe('card grid', () => {
		test.describe('mobile layout', () => {
			test.beforeEach(async ({ page }) => {
				await page.setViewportSize(MOBILE_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);
			});

			test('settings page loads with title', async ({ page }) => {
				const heading = page.locator('h3').first();
				await expect(heading).toBeVisible();
			});

			test('displays 5 settings cards', async ({ page }) => {
				const cards = page.locator('.settings-card');
				await expect(cards).toHaveCount(5);
			});

			test('each card has an icon', async ({ page }) => {
				const icons = page.locator('.settings-card-icon');
				await expect(icons).toHaveCount(5);
				for (let i = 0; i < 5; i++) {
					await expect(icons.nth(i)).toBeVisible();
				}
			});

			test('each card has a title', async ({ page }) => {
				const titles = page.locator('.settings-card-title');
				await expect(titles).toHaveCount(5);
				for (let i = 0; i < 5; i++) {
					await expect(titles.nth(i)).not.toBeEmpty();
				}
			});

			test('each card has a description', async ({ page }) => {
				const descriptions = page.locator('.settings-card-description');
				await expect(descriptions).toHaveCount(5);
				for (let i = 0; i < 5; i++) {
					await expect(descriptions.nth(i)).not.toBeEmpty();
				}
			});

			test('cards are stacked in a single column on mobile', async ({ page }) => {
				const cards = page.locator('.settings-card');
				const count = await cards.count();
				expect(count).toBe(5);

				const firstCardBox = await cards.first().boundingBox();
				const secondCardBox = await cards.nth(1).boundingBox();

				expect(firstCardBox).not.toBeNull();
				expect(secondCardBox).not.toBeNull();

				if (firstCardBox && secondCardBox) {
					expect(secondCardBox.y).toBeGreaterThan(firstCardBox.y + firstCardBox.height - 10);
				}
			});

			test('cards are links with correct hrefs', async ({ page }) => {
				for (const card of SETTINGS_CARDS) {
					const link = page.locator(`a[href="/settings/${card.slug}"]`);
					await expect(link).toBeVisible();
				}
			});
		});

		test.describe('card backgrounds', () => {
			test('cards have a visible background different from page', async ({ page }) => {
				await page.setViewportSize(MOBILE_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const card = page.locator('.settings-card').first();
				const pageBg = page.locator('.settings-grid').first();

				const cardBg = await card.evaluate((el) => {
					const style = window.getComputedStyle(el);
					return style.backgroundColor;
				});

				const pageBgColor = await pageBg.evaluate((el) => {
					const style = window.getComputedStyle(el);
					return style.backgroundColor;
				});

				expect(cardBg).not.toBe('rgba(0, 0, 0, 0)');
				expect(cardBg).not.toBe('transparent');
			});

			test('cards have border for visual separation', async ({ page }) => {
				await page.setViewportSize(MOBILE_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const card = page.locator('.settings-card').first();
				const borderStyle = await card.evaluate((el) => {
					const style = window.getComputedStyle(el);
					return {
						width: style.borderWidth,
						style: style.borderStyle,
						color: style.borderColor
					};
				});

				expect(parseInt(borderStyle.width)).toBeGreaterThan(0);
				expect(borderStyle.style).not.toBe('none');
			});
		});

		test.describe('icon sizing', () => {
			test('icons are at least 48px wide', async ({ page }) => {
				await page.setViewportSize(MOBILE_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const icons = page.locator('.settings-card-icon');
				const count = await icons.count();

				for (let i = 0; i < count; i++) {
					const box = await icons.nth(i).boundingBox();
					expect(box).not.toBeNull();
					if (box) {
						expect(box.width).toBeGreaterThanOrEqual(48);
					}
				}
			});

			test('icons are centered horizontally in their card', async ({ page }) => {
				await page.setViewportSize(MOBILE_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const cards = page.locator('.settings-card');
				const icons = page.locator('.settings-card-icon');
				const count = await cards.count();

				for (let i = 0; i < count; i++) {
					const cardBox = await cards.nth(i).boundingBox();
					const iconBox = await icons.nth(i).boundingBox();
					expect(cardBox).not.toBeNull();
					expect(iconBox).not.toBeNull();

					if (cardBox && iconBox) {
						const cardCenter = cardBox.x + cardBox.width / 2;
						const iconCenter = iconBox.x + iconBox.width / 2;
						expect(Math.abs(cardCenter - iconCenter)).toBeLessThan(20);
					}
				}
			});
		});

		test.describe('mobile touch feedback', () => {
			test('cards have active/pressed state for touch', async ({ page }) => {
				await page.setViewportSize(MOBILE_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const card = page.locator('.settings-card').first();

				const hasActiveStyle = await card.evaluate((el) => {
					const sheets = Array.from(document.styleSheets);
					for (const sheet of sheets) {
						try {
							const rules = Array.from(sheet.cssRules || []);
							for (const rule of rules) {
								if (
									rule instanceof CSSStyleRule &&
									rule.selectorText &&
									rule.selectorText.includes('.settings-card') &&
									rule.selectorText.includes(':active')
								) {
									return true;
								}
							}
						} catch {
							// cross-origin sheets
						}
					}
					return false;
				});

				expect(hasActiveStyle).toBe(true);
			});

			test('cards respond to tap with visual feedback on mobile', async ({ page }) => {
				await page.setViewportSize(MOBILE_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const card = page.locator('.settings-card').first();

				const beforeTransform = await card.evaluate((el) => {
					return window.getComputedStyle(el).transform;
				});

				await page.mouse.move(200, 200);
				await page.mouse.down();
				await page.waitForTimeout(100);

				const afterTransform = await card.evaluate((el) => {
					return window.getComputedStyle(el).transform;
				});

				await page.mouse.up();

				expect(afterTransform).not.toBe(beforeTransform);
			});
		});

		test.describe('tablet layout', () => {
			test('cards display in 2 columns on tablet', async ({ page }) => {
				await page.setViewportSize(TABLET_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const cards = page.locator('.settings-card');
				const firstBox = await cards.first().boundingBox();
				const secondBox = await cards.nth(1).boundingBox();

				expect(firstBox).not.toBeNull();
				expect(secondBox).not.toBeNull();

				if (firstBox && secondBox) {
					expect(secondBox.x).toBeGreaterThan(firstBox.x);
					expect(Math.abs(secondBox.y - firstBox.y)).toBeLessThan(10);
				}
			});
		});

		test.describe('desktop layout', () => {
			test('cards display in 3 columns on desktop', async ({ page }) => {
				await page.setViewportSize(DESKTOP_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const cards = page.locator('.settings-card');
				const firstBox = await cards.first().boundingBox();
				const secondBox = await cards.nth(1).boundingBox();
				const thirdBox = await cards.nth(2).boundingBox();

				expect(firstBox).not.toBeNull();
				expect(secondBox).not.toBeNull();
				expect(thirdBox).not.toBeNull();

				if (firstBox && secondBox && thirdBox) {
					expect(secondBox.x).toBeGreaterThan(firstBox.x);
					expect(thirdBox.x).toBeGreaterThan(secondBox.x);
					expect(Math.abs(secondBox.y - firstBox.y)).toBeLessThan(10);
					expect(Math.abs(thirdBox.y - firstBox.y)).toBeLessThan(10);
				}
			});

			test('cards have hover effect on desktop', async ({ page }) => {
				await page.setViewportSize(DESKTOP_VIEWPORT);
				await page.goto('/settings', { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const card = page.locator('.settings-card').first();

				const beforeShadow = await card.evaluate((el) => {
					return window.getComputedStyle(el).boxShadow;
				});

				await card.hover();
				await page.waitForTimeout(300);

				const afterShadow = await card.evaluate((el) => {
					return window.getComputedStyle(el).boxShadow;
				});

				expect(afterShadow).not.toBe(beforeShadow);
			});
		});
	});

	test.describe('navigation to sub-routes', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);
		});

		for (const card of SETTINGS_CARDS) {
			test(`clicking ${card.slug} card navigates to /settings/${card.slug}`, async ({ page }) => {
				const link = page.locator(`a[href="/settings/${card.slug}"]`);
				await link.click();
				await page.waitForTimeout(1000);

				expect(page.url()).toContain(`/settings/${card.slug}`);
			});
		}
	});

	test.describe('sub-page back button', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
		});

		for (const card of SETTINGS_CARDS) {
			test(`/settings/${card.slug} has a back button to /settings`, async ({ page }) => {
				await page.goto(`/settings/${card.slug}`, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const backBtn = page.locator('a[href="/settings"]').first();
				await expect(backBtn).toBeVisible();
			});

			test(`back button on /settings/${card.slug} returns to /settings`, async ({ page }) => {
				await page.goto(`/settings/${card.slug}`, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const backBtn = page.locator('a[href="/settings"]').first();
				await backBtn.click();
				await page.waitForTimeout(1000);

				expect(page.url()).toMatch(/\/settings$/);
			});
		}

		test('back button has a visible background', async ({ page }) => {
			await page.goto('/settings/nostr', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const backBtn = page.locator('a[href="/settings"]').first();
			const bg = await backBtn.evaluate((el) => {
				const style = window.getComputedStyle(el);
				return style.backgroundColor;
			});

			expect(bg).not.toBe('rgba(0, 0, 0, 0)');
			expect(bg).not.toBe('transparent');
		});
	});

	test.describe('sub-page content is shown directly (no collapse)', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
		});

		test('nostr sub-page shows content without section collapse', async ({ page }) => {
			await page.goto('/settings/nostr', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const sectionTitle = page.locator('.settings-content h4').first();
			await expect(sectionTitle).toBeVisible();

			const sectionContent = page.locator('.settings-content input[readonly]').first();
			await expect(sectionContent).toBeVisible();
		});

		test('devices sub-page shows content without section collapse', async ({ page }) => {
			await page.goto('/settings/devices', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const sectionTitle = page.locator('.settings-content h4').first();
			await expect(sectionTitle).toBeVisible();
		});

		test('recovery sub-page shows content without section collapse', async ({ page }) => {
			await page.goto('/settings/recovery', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const sectionTitle = page.locator('.settings-content h4').first();
			await expect(sectionTitle).toBeVisible();
		});

		test('muted sub-page shows content without section collapse', async ({ page }) => {
			await page.goto('/settings/muted', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const sectionTitle = page.locator('.settings-content h4').first();
			await expect(sectionTitle).toBeVisible();
		});

		test('actions sub-page shows content without section collapse', async ({ page }) => {
			await page.goto('/settings/actions', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const sectionTitle = page.locator('.settings-content h4').first();
			await expect(sectionTitle).toBeVisible();
		});
	});

	test.describe('sub-page content backgrounds', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
		});

		for (const card of SETTINGS_CARDS) {
			test(`/settings/${card.slug} content area has a background`, async ({ page }) => {
				await page.goto(`/settings/${card.slug}`, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(2000);

				const contentPanel = page.locator('.settings-sub-content').first();
				await expect(contentPanel).toBeVisible();

				const bg = await contentPanel.evaluate((el) => {
					const style = window.getComputedStyle(el);
					return style.backgroundColor;
				});

				expect(bg).not.toBe('rgba(0, 0, 0, 0)');
				expect(bg).not.toBe('transparent');
			});
		}
	});

	test.describe('page transitions', () => {
		test('navigating from settings to sub-route shows sub-route content', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const link = page.locator('a[href="/settings/nostr"]');
			await link.click();
			await page.waitForTimeout(1000);

			await expect(page.locator('.settings-content')).toBeVisible();
			expect(page.url()).toContain('/settings/nostr');
		});

		test('navigating back from sub-route shows card grid', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings/nostr', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const backBtn = page.locator('a[href="/settings"]').first();
			await backBtn.click();
			await page.waitForTimeout(1000);

			const cards = page.locator('.settings-card');
			await expect(cards.first()).toBeVisible({ timeout: 3000 });
		});

		test('sub-route content does not appear below card grid during navigation', async ({
			page
		}) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			await page.locator('a[href="/settings/nostr"]').click();
			await page.waitForTimeout(500);

			const cards = page.locator('.settings-card');
			const cardCount = await cards.count();
			expect(cardCount).toBe(0);
		});
	});

	test.describe('animated icons', () => {
		test('card icons have animation classes', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const icons = page.locator('.settings-card-icon');
			const count = await icons.count();
			expect(count).toBe(5);

			for (let i = 0; i < count; i++) {
				const icon = icons.nth(i);
				await expect(icon).toBeVisible();
				const hasAnimation = await icon.evaluate((el) => {
					const style = window.getComputedStyle(el);
					return style.animationName !== 'none' || style.animation !== '';
				});
				expect(hasAnimation).toBe(true);
			}
		});

		test('icons respect prefers-reduced-motion', async ({ page, context }) => {
			await context.addCookies([]);
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const icons = page.locator('.settings-card-icon');
			const count = await icons.count();

			for (let i = 0; i < count; i++) {
				const icon = icons.nth(i);
				const animation = await icon.evaluate((el) => {
					const style = window.getComputedStyle(el);
					return style.animationName;
				});
				expect(animation).toBe('none');
			}
		});
	});

	test.describe('performance', () => {
		test('settings page loads within 3 seconds', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);

			const startTime = Date.now();
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.locator('.settings-card').first().waitFor({ timeout: 5000 });
			const elapsed = Date.now() - startTime;

			expect(elapsed).toBeLessThan(3000);
		});

		test('card entrance animation completes within 2 seconds', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });

			const cards = page.locator('.settings-card');
			await expect(cards.last()).toBeVisible({ timeout: 3000 });
		});

		test('sub-route navigation completes within 1 second', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const startTime = Date.now();
			await page.locator('a[href="/settings/nostr"]').click();
			await page.waitForURL('**/settings/nostr', { timeout: 3000 });
			const elapsed = Date.now() - startTime;

			expect(elapsed).toBeLessThan(1000);
		});
	});

	test.describe('accessibility', () => {
		test('cards are keyboard navigable', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const firstCard = page.locator('a.settings-card').first();
			await firstCard.focus();
			await expect(firstCard).toBeFocused();

			await page.keyboard.press('Tab');
			const secondCard = page.locator('a.settings-card').nth(1);
			await expect(secondCard).toBeFocused();
		});

		test('cards have accessible names', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const cards = page.locator('a.settings-card');
			const count = await cards.count();

			for (let i = 0; i < count; i++) {
				const card = cards.nth(i);
				const accessibleName =
					(await card.getAttribute('aria-label')) || (await card.textContent());
				expect(accessibleName).toBeTruthy();
				expect(accessibleName!.trim().length).toBeGreaterThan(0);
			}
		});

		test('back button on sub-page is accessible', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings/nostr', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const backBtn = page.locator('a[href="/settings"]').first();
			await expect(backBtn).toBeVisible();

			const tagName = await backBtn.evaluate((el) => el.tagName.toLowerCase());
			expect(tagName).toBe('a');
		});
	});

	test.describe('responsive behavior', () => {
		test('transition from mobile to tablet updates grid', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);
			await page.goto('/settings', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const cards = page.locator('.settings-card');
			const mobileFirstBox = await cards.first().boundingBox();
			const mobileSecondBox = await cards.nth(1).boundingBox();

			if (mobileFirstBox && mobileSecondBox) {
				expect(mobileSecondBox.y).toBeGreaterThan(mobileFirstBox.y);
			}

			await page.setViewportSize(TABLET_VIEWPORT);
			await page.waitForTimeout(500);

			const tabletFirstBox = await cards.first().boundingBox();
			const tabletSecondBox = await cards.nth(1).boundingBox();

			if (tabletFirstBox && tabletSecondBox) {
				expect(tabletSecondBox.x).toBeGreaterThan(tabletFirstBox.x);
			}
		});

		test('sub-pages are responsive on mobile', async ({ page }) => {
			await page.setViewportSize(MOBILE_VIEWPORT);

			for (const card of SETTINGS_CARDS) {
				await page.goto(`/settings/${card.slug}`, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(1000);

				const content = page.locator('.settings-content');
				await expect(content).toBeVisible();

				const box = await content.boundingBox();
				expect(box).not.toBeNull();
				if (box) {
					expect(box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
				}
			}
		});
	});
});

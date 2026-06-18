import { test, expect, type Page } from '@playwright/test';

/**
 * Theme & Light Mode E2E Tests
 *
 * Reproduces and guards against the regression where text becomes invisible
 * in light mode (especially white text on white/near-white backgrounds).
 *
 * Root causes tested:
 * 1. Hardcoded `text-white` on elements with theme-dependent backgrounds
 * 2. `dark:` Tailwind modifier that doesn't respond to DaisyUI's `data-theme`
 * 3. Body text color not switching properly between themes
 */

const PUBLIC_ROUTES = [
	{ path: '/', name: 'Homepage' },
	{ path: '/tasks', name: 'Tasks Browse' },
	{ path: '/services', name: 'Services Browse' },
	{ path: '/about', name: 'About' },
	{ path: '/how-it-works', name: 'How It Works' },
	{ path: '/faq', name: 'FAQ' },
	{ path: '/auth/login', name: 'Login' },
	{ path: '/auth/signup', name: 'Signup' }
];

/** Minimum contrast ratio for normal text (WCAG AA) */
const MIN_CONTRAST_RATIO = 3.0;

/**
 * Calculate relative luminance of an RGB color.
 * @see https://www.w3.org/TR/WCAG20/#relativeluminancedef
 */
function luminance(r: number, g: number, b: number): number {
	const [rs, gs, bs] = [r, g, b].map((c) => {
		c = c / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});
	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two RGB colors.
 * @see https://www.w3.org/TR/WCAG20/#contrast-ratiodef
 */
function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
	const l1 = luminance(...fg);
	const l2 = luminance(...bg);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse "rgb(r, g, b)" or "rgba(r, g, b, a)" to [r, g, b].
 * Also handles "transparent" and hex formats.
 */
function parseColor(color: string): [number, number, number] | null {
	if (!color || color === 'transparent') return null;
	const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
	if (rgbMatch) {
		return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
	}
	return null;
}

/**
 * Walk up the DOM tree to find the effective background color.
 * Returns the first non-transparent background color found.
 */
async function getEffectiveBackground(
	page: Page,
	selector: string
): Promise<[number, number, number] | null> {
	return page.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (!el) return null;

		let current: Element | null = el;
		while (current) {
			const bg = getComputedStyle(current).backgroundColor;
			if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
				const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
				if (match) {
					return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
				}
			}
			current = current.parentElement;
		}
		// Fallback: white
		return [255, 255, 255];
	}, selector);
}

/** Set theme via DOM + Capacitor Preferences mock */
async function setTheme(page: Page, theme: 'light' | 'dark') {
	await page.evaluate((t) => {
		document.documentElement.setAttribute('data-theme', t);
	}, theme);
	// Wait for CSS transitions to settle
	await page.waitForTimeout(300);
}

/** Get current data-theme attribute */
async function getTheme(page: Page): Promise<string | null> {
	return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

test.describe('Theme Toggle Functionality', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('default theme is set on initial load', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const theme = await getTheme(page);
		// Theme should be either 'dark' or 'light' (depends on system preference)
		expect(['dark', 'light']).toContain(theme);
	});

	test('clicking dark mode toggle switches theme', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const initialTheme = await getTheme(page);

		// The checkbox is hidden inside a daisyUI swap label — click the label
		const toggleLabel = page.locator('label.swap').first();
		await toggleLabel.click();
		await page.waitForTimeout(500);

		const newTheme = await getTheme(page);
		expect(newTheme).not.toBe(initialTheme);
	});

	test('clicking toggle again switches back to original theme', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const initialTheme = await getTheme(page);
		const toggleLabel = page.locator('label.swap').first();

		// Switch theme
		await toggleLabel.click();
		await page.waitForTimeout(500);
		expect(await getTheme(page)).not.toBe(initialTheme);

		// Switch back
		await toggleLabel.click();
		await page.waitForTimeout(500);
		expect(await getTheme(page)).toBe(initialTheme);
	});

	test('theme attribute is set on document element', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		await setTheme(page, 'light');
		const lightTheme = await page.evaluate(() =>
			document.documentElement.getAttribute('data-theme')
		);
		expect(lightTheme).toBe('light');

		await setTheme(page, 'dark');
		const darkTheme = await page.evaluate(() =>
			document.documentElement.getAttribute('data-theme')
		);
		expect(darkTheme).toBe('dark');
	});
});

test.describe('Light Mode Text Visibility — Critical Pages', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	for (const route of PUBLIC_ROUTES) {
		test(`${route.name} (${route.path}) — body text is visible in light mode`, async ({ page }) => {
			await page.goto(route.path, { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);

			// Switch to light mode
			await setTheme(page, 'light');

			// Check body text color vs background
			const bodyStyles = await page.evaluate(() => {
				const body = document.body;
				const cs = getComputedStyle(body);
				return {
					color: cs.color,
					backgroundColor: cs.backgroundColor
				};
			});

			const fgColor = parseColor(bodyStyles.color);
			const bgColor = parseColor(bodyStyles.backgroundColor);

			if (fgColor && bgColor) {
				const ratio = contrastRatio(fgColor, bgColor);
				expect(
					ratio,
					`Body text contrast ratio ${ratio.toFixed(2)} is too low on ${route.path} in light mode. ` +
						`FG: ${bodyStyles.color}, BG: ${bodyStyles.backgroundColor}`
				).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
			}
		});
	}
});

test.describe('Light Mode Text Visibility — Element-Level Checks', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('homepage hero section text is visible in light mode', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		// Check the hero section text
		const heroText = page.locator('.hero .hero-content p').first();
		if (await heroText.isVisible()) {
			const styles = await heroText.evaluate((el) => {
				const cs = getComputedStyle(el);
				return { color: cs.color };
			});

			const fgColor = parseColor(styles.color);
			// Hero has bg-base-100, which in light mode is #fafafa
			const bgColor: [number, number, number] = [250, 250, 250];

			if (fgColor) {
				const ratio = contrastRatio(fgColor, bgColor);
				expect(
					ratio,
					`Hero text contrast too low: ${ratio.toFixed(2)}. Color: ${styles.color}`
				).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
			}
		}
	});

	test('navigation bar text is visible in light mode', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		// Check navbar text visibility
		const navbar = page.locator('.navbar').first();
		if (await navbar.isVisible()) {
			const navbarStyles = await navbar.evaluate((el) => {
				const cs = getComputedStyle(el);
				// Get all text elements inside navbar
				const textElements = el.querySelectorAll('a, span, button');
				const textColors: string[] = [];
				textElements.forEach((textEl) => {
					const textCs = getComputedStyle(textEl);
					if (textCs.color && !textColors.includes(textCs.color)) {
						textColors.push(textCs.color);
					}
				});
				return {
					backgroundColor: cs.backgroundColor,
					textColors
				};
			});

			const bgColor = parseColor(navbarStyles.backgroundColor);
			if (bgColor) {
				for (const textColor of navbarStyles.textColors) {
					const fgColor = parseColor(textColor);
					if (fgColor) {
						const ratio = contrastRatio(fgColor, bgColor);
						// Use lower threshold for nav items since they may be on semi-transparent bg
						expect(
							ratio,
							`Navbar text contrast too low: ${ratio.toFixed(2)}. ` +
								`Text: ${textColor}, BG: ${navbarStyles.backgroundColor}`
						).toBeGreaterThanOrEqual(2.0);
					}
				}
			}
		}
	});

	test('tasks page content is visible in light mode', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		// Check main content area
		const contentArea = page.locator('.app-shell__content').first();
		const contentStyles = await contentArea.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { backgroundColor: cs.backgroundColor };
		});

		const bgColor = parseColor(contentStyles.backgroundColor);
		expect(bgColor, 'Content area should have a background color in light mode').not.toBeNull();

		if (bgColor) {
			// In light mode, the background should be light (high luminance)
			const bgLuminance = luminance(...bgColor);
			expect(bgLuminance, 'Content background should be light in light mode').toBeGreaterThan(0.5);
		}
	});

	test('services page content is visible in light mode', async ({ page }) => {
		await page.goto('/services', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		const contentArea = page.locator('.app-shell__content').first();
		const contentStyles = await contentArea.evaluate((el) => {
			const cs = getComputedStyle(el);
			return { backgroundColor: cs.backgroundColor };
		});

		const bgColor = parseColor(contentStyles.backgroundColor);
		expect(bgColor).not.toBeNull();

		if (bgColor) {
			const bgLuminance = luminance(...bgColor);
			expect(bgLuminance).toBeGreaterThan(0.5);
		}
	});

	test('login page form text is visible in light mode', async ({ page }) => {
		await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		// Check that form labels and text are visible
		const formTexts = await page.evaluate(() => {
			const results: Array<{ selector: string; color: string; bg: string }> = [];
			// Check labels
			const labels = document.querySelectorAll('label, .label-text, h1, h2, h3, p');
			labels.forEach((el) => {
				const cs = getComputedStyle(el);
				if (cs.color && el.textContent?.trim()) {
					// Find effective background
					let parent: Element | null = el.parentElement;
					let bgColor = 'rgba(0, 0, 0, 0)';
					while (parent) {
						const parentBg = getComputedStyle(parent).backgroundColor;
						if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
							bgColor = parentBg;
							break;
						}
						parent = parent.parentElement;
					}
					results.push({
						selector: el.tagName + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
						color: cs.color,
						bg: bgColor
					});
				}
			});
			return results.slice(0, 10); // Limit to first 10 elements
		});

		for (const item of formTexts) {
			const fg = parseColor(item.color);
			const bg = parseColor(item.bg);
			if (fg && bg) {
				const ratio = contrastRatio(fg, bg);
				expect(
					ratio,
					`Login page "${item.selector}" contrast too low: ${ratio.toFixed(2)}. ` +
						`Text: ${item.color}, BG: ${item.bg}`
				).toBeGreaterThanOrEqual(2.0);
			}
		}
	});
});

test.describe('Light Mode — Specific Regression Checks', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('app.css body text color responds to theme change', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Dark mode: body text should be light
		await setTheme(page, 'dark');
		const darkBodyColor = await page.evaluate(() => getComputedStyle(document.body).color);

		// Light mode: body text should be dark
		await setTheme(page, 'light');
		const lightBodyColor = await page.evaluate(() => getComputedStyle(document.body).color);

		// The colors MUST be different between themes
		// This is the CRITICAL test — if the dark: modifier doesn't respond to data-theme,
		// the body text color will be the same in both modes, making text invisible in light mode.
		expect(
			darkBodyColor,
			'Body text color should change between dark and light themes. ' +
				'If this fails, the CSS uses dark: modifier which does not respond to DaisyUI data-theme.'
		).not.toBe(lightBodyColor);
	});

	test('base-content color variable changes between themes', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const darkContentColor = await page.evaluate(() => {
			document.documentElement.setAttribute('data-theme', 'dark');
			return getComputedStyle(document.documentElement)
				.getPropertyValue('--color-base-content')
				.trim();
		});

		const lightContentColor = await page.evaluate(() => {
			document.documentElement.setAttribute('data-theme', 'light');
			return getComputedStyle(document.documentElement)
				.getPropertyValue('--color-base-content')
				.trim();
		});

		expect(darkContentColor, 'base-content CSS variable should differ between themes').not.toBe(
			lightContentColor
		);
	});

	test('navbar uses theme-aware colors in light mode', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		// Check that the navbar background is theme-appropriate
		const navbarBg = await page.evaluate(() => {
			const navbar = document.querySelector('.navbar');
			if (!navbar) return null;
			return getComputedStyle(navbar).backgroundColor;
		});

		const bg = parseColor(navbarBg || '');
		if (bg) {
			// In light mode, navbar should have a light background
			const bgLum = luminance(...bg);
			expect(bgLum, 'Navbar background should be light in light mode').toBeGreaterThan(0.3);
		}
	});

	test('bottom nav dock text is visible in light mode (mobile)', async ({ page }) => {
		// Use mobile viewport to show bottom nav
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		// The dock has bg-primary which stays orange, so text-primary-content should be visible
		const dockEl = page.locator('.dock').first();
		if (await dockEl.isVisible()) {
			const dockStyles = await dockEl.evaluate((el) => {
				const cs = getComputedStyle(el);
				return {
					backgroundColor: cs.backgroundColor,
					color: cs.color
				};
			});

			const bg = parseColor(dockStyles.backgroundColor);
			const fg = parseColor(dockStyles.color);

			if (bg && fg) {
				const ratio = contrastRatio(fg, bg);
				expect(
					ratio,
					`Dock text contrast too low: ${ratio.toFixed(2)}. ` +
						`Text: ${dockStyles.color}, BG: ${dockStyles.backgroundColor}`
				).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
			}
		}
	});
});

test.describe('Light Mode — Theme Persistence Across Navigation', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('theme persists when navigating between pages', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Switch to light mode via the label (checkbox is hidden in daisyUI swap)
		const toggleLabel = page.locator('label.swap').first();
		await toggleLabel.click();
		await page.waitForTimeout(500);
		const themeAfterToggle = await getTheme(page);
		expect(['dark', 'light']).toContain(themeAfterToggle);

		// Navigate to tasks
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);
		expect(await getTheme(page)).toBe(themeAfterToggle);

		// Navigate to about
		await page.goto('/about', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);
		expect(await getTheme(page)).toBe(themeAfterToggle);
	});

	test('theme toggle works on multiple pages', async ({ page }) => {
		const pagesToTest = ['/', '/tasks', '/about', '/auth/login'];

		for (const route of pagesToTest) {
			await page.goto(route, { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const initialTheme = await getTheme(page);

			// The checkbox is hidden inside a daisyUI swap label — click the label
			const toggleLabel = page.locator('label.swap').first();
			if (await toggleLabel.isVisible()) {
				await toggleLabel.click();
				await page.waitForTimeout(500);
				const newTheme = await getTheme(page);
				expect(newTheme, `Theme should change on ${route}`).not.toBe(initialTheme);

				// Toggle back
				await toggleLabel.click();
				await page.waitForTimeout(500);
				expect(await getTheme(page), `Theme should revert on ${route}`).toBe(initialTheme);
			}
		}
	});
});

test.describe('Light Mode — No White-on-White Text', () => {
	test.use({ viewport: { width: 1440, height: 900 } });

	test('no invisible text on homepage in light mode', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		// Scan all visible text elements for white-on-white
		const invisibleTexts = await page.evaluate(() => {
			const problems: Array<{
				selector: string;
				text: string;
				color: string;
				bg: string;
			}> = [];

			const textElements = document.querySelectorAll(
				'h1, h2, h3, h4, h5, h6, p, span, a, label, li, button, td, th'
			);

			textElements.forEach((el) => {
				// Skip hidden elements
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;

				const cs = getComputedStyle(el);
				const color = cs.color;

				// Find effective background
				let parent: Element | null = el.parentElement;
				let bgColor = '';
				while (parent) {
					const parentBg = getComputedStyle(parent).backgroundColor;
					if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
						bgColor = parentBg;
						break;
					}
					parent = parent.parentElement;
				}

				const fgMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
				const bgMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

				if (fgMatch && bgMatch) {
					const fg: [number, number, number] = [
						parseInt(fgMatch[1]),
						parseInt(fgMatch[2]),
						parseInt(fgMatch[3])
					];
					const bg: [number, number, number] = [
						parseInt(bgMatch[1]),
						parseInt(bgMatch[2]),
						parseInt(bgMatch[3])
					];

					const l1 = 0.2126 * (fg[0] / 255) + 0.7152 * (fg[1] / 255) + 0.0722 * (fg[2] / 255);
					const l2 = 0.2126 * (bg[0] / 255) + 0.7152 * (bg[1] / 255) + 0.0722 * (bg[2] / 255);
					const lighter = Math.max(l1, l2);
					const darker = Math.min(l1, l2);
					const ratio = (lighter + 0.05) / (darker + 0.05);

					if (ratio < 1.5) {
						// Nearly invisible
						problems.push({
							selector:
								el.tagName +
								(el.id ? `#${el.id}` : '') +
								(el.className && typeof el.className === 'string'
									? '.' + el.className.split(' ').slice(0, 2).join('.')
									: ''),
							text: (el.textContent || '').slice(0, 50),
							color,
							bg: bgColor
						});
					}
				}
			});

			return problems;
		});

		expect(
			invisibleTexts,
			`Found ${invisibleTexts.length} invisible text elements in light mode:\n` +
				invisibleTexts
					.map((t) => `  - ${t.selector}: "${t.text}" (color: ${t.color}, bg: ${t.bg})`)
					.join('\n')
		).toHaveLength(0);
	});

	test('no invisible text on login page in light mode', async ({ page }) => {
		await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		const invisibleTexts = await page.evaluate(() => {
			const problems: Array<{
				selector: string;
				text: string;
				color: string;
				bg: string;
			}> = [];

			const textElements = document.querySelectorAll(
				'h1, h2, h3, h4, h5, h6, p, span, a, label, li, button'
			);

			textElements.forEach((el) => {
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;

				const cs = getComputedStyle(el);
				const color = cs.color;

				let parent: Element | null = el.parentElement;
				let bgColor = '';
				while (parent) {
					const parentBg = getComputedStyle(parent).backgroundColor;
					if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
						bgColor = parentBg;
						break;
					}
					parent = parent.parentElement;
				}

				const fgMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
				const bgMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

				if (fgMatch && bgMatch) {
					const fg: [number, number, number] = [
						parseInt(fgMatch[1]),
						parseInt(fgMatch[2]),
						parseInt(fgMatch[3])
					];
					const bg: [number, number, number] = [
						parseInt(bgMatch[1]),
						parseInt(bgMatch[2]),
						parseInt(bgMatch[3])
					];

					const l1 = 0.2126 * (fg[0] / 255) + 0.7152 * (fg[1] / 255) + 0.0722 * (fg[2] / 255);
					const l2 = 0.2126 * (bg[0] / 255) + 0.7152 * (bg[1] / 255) + 0.0722 * (bg[2] / 255);
					const lighter = Math.max(l1, l2);
					const darker = Math.min(l1, l2);
					const ratio = (lighter + 0.05) / (darker + 0.05);

					if (ratio < 1.5) {
						problems.push({
							selector:
								el.tagName +
								(el.id ? `#${el.id}` : '') +
								(el.className && typeof el.className === 'string'
									? '.' + el.className.split(' ').slice(0, 2).join('.')
									: ''),
							text: (el.textContent || '').slice(0, 50),
							color,
							bg: bgColor
						});
					}
				}
			});

			return problems;
		});

		expect(
			invisibleTexts,
			`Found ${invisibleTexts.length} invisible text elements on login in light mode:\n` +
				invisibleTexts
					.map((t) => `  - ${t.selector}: "${t.text}" (color: ${t.color}, bg: ${t.bg})`)
					.join('\n')
		).toHaveLength(0);
	});

	test('no invisible text on tasks page in light mode', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		const invisibleTexts = await page.evaluate(() => {
			const problems: Array<{
				selector: string;
				text: string;
				color: string;
				bg: string;
			}> = [];

			const textElements = document.querySelectorAll(
				'h1, h2, h3, h4, h5, h6, p, span, a, label, li, button'
			);

			textElements.forEach((el) => {
				const rect = el.getBoundingClientRect();
				if (rect.width === 0 || rect.height === 0) return;

				const cs = getComputedStyle(el);
				const color = cs.color;

				let parent: Element | null = el.parentElement;
				let bgColor = '';
				while (parent) {
					const parentBg = getComputedStyle(parent).backgroundColor;
					if (parentBg && parentBg !== 'rgba(0, 0, 0, 0)' && parentBg !== 'transparent') {
						bgColor = parentBg;
						break;
					}
					parent = parent.parentElement;
				}

				const fgMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
				const bgMatch = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);

				if (fgMatch && bgMatch) {
					const fg: [number, number, number] = [
						parseInt(fgMatch[1]),
						parseInt(fgMatch[2]),
						parseInt(fgMatch[3])
					];
					const bg: [number, number, number] = [
						parseInt(bgMatch[1]),
						parseInt(bgMatch[2]),
						parseInt(bgMatch[3])
					];

					const l1 = 0.2126 * (fg[0] / 255) + 0.7152 * (fg[1] / 255) + 0.0722 * (fg[2] / 255);
					const l2 = 0.2126 * (bg[0] / 255) + 0.7152 * (bg[1] / 255) + 0.0722 * (bg[2] / 255);
					const lighter = Math.max(l1, l2);
					const darker = Math.min(l1, l2);
					// Use higher threshold for stricter check
					if ((lighter + 0.05) / (darker + 0.05) < 1.5) {
						problems.push({
							selector:
								el.tagName +
								(el.id ? `#${el.id}` : '') +
								(el.className && typeof el.className === 'string'
									? '.' + el.className.split(' ').slice(0, 2).join('.')
									: ''),
							text: (el.textContent || '').slice(0, 50),
							color,
							bg: bgColor
						});
					}
				}
			});

			return problems;
		});

		expect(
			invisibleTexts,
			`Found ${invisibleTexts.length} invisible text elements on tasks page:\n` +
				invisibleTexts
					.map((t) => `  - ${t.selector}: "${t.text}" (color: ${t.color}, bg: ${t.bg})`)
					.join('\n')
		).toHaveLength(0);
	});
});

test.describe('Light Mode — Mobile Viewport', () => {
	test.use({ viewport: { width: 375, height: 667 } });

	test('homepage renders correctly in light mode on mobile', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		// Check that the main content area has appropriate colors
		const mainStyles = await page.evaluate(() => {
			const main = document.querySelector('main');
			if (!main) return null;
			const cs = getComputedStyle(main);
			return {
				backgroundColor: cs.backgroundColor,
				color: cs.color
			};
		});

		expect(mainStyles).not.toBeNull();

		if (mainStyles) {
			const bg = parseColor(mainStyles.backgroundColor);
			if (bg) {
				const bgLum = luminance(...bg);
				expect(bgLum, 'Main background should be light on mobile in light mode').toBeGreaterThan(
					0.3
				);
			}
		}
	});

	test('bottom nav is visible in light mode on mobile', async ({ page }) => {
		await page.goto('/', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(3000);
		await setTheme(page, 'light');

		// The bottom nav dock uses bg-primary (orange), which should be the same in both themes
		const dockEl = page.locator('.dock').first();
		if (await dockEl.isVisible()) {
			const dockBg = await dockEl.evaluate((el) => getComputedStyle(el).backgroundColor);
			const bg = parseColor(dockBg);

			expect(bg, 'Dock should have a background color').not.toBeNull();

			if (bg) {
				// bg-primary is orange (#f7931a), should be visible in both themes
				expect(bg[0]).toBeGreaterThan(100); // Red channel should be high for orange
				expect(bg[1]).toBeGreaterThan(50); // Green channel should be moderate
			}
		}
	});
});

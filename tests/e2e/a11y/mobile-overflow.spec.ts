import { expect, test } from '@playwright/test';

const routes = [
	'/',
	'/wallet',
	'/tasks',
	'/tasks/example',
	'/services',
	'/services/example',
	'/earning/bids',
	'/earning/contracts',
	'/hiring/contracts',
	'/messages',
	'/notifications',
	'/profile',
	'/settings',
	'/create-task',
	'/create-service'
];

const widths = [360, 390, 412];

test.describe('pages stay inside the phone viewport', () => {
	test.beforeEach(async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'a11y', 'Runs in the a11y project');
		await page.addInitScript(() => {
			localStorage.setItem('CapacitorStorage.access_token', 'playwright-mobile-overflow');
		});
	});

	for (const width of widths) {
		for (const route of routes) {
			test(`${route} at ${width}px does not scroll sideways`, async ({ page }) => {
				await page.setViewportSize({ width, height: 800 });
				await page.goto(route, { waitUntil: 'domcontentloaded' });
				await page.locator('body').waitFor({ state: 'visible' });
				await page
					.waitForFunction(() => !document.querySelector('[data-testid="header-auth-pending"]'), {
						timeout: 5000
					})
					.catch(() => undefined);

				const result = await page.evaluate(() => {
					const innerWidth = window.innerWidth;
					const scrollWidth = Math.max(
						document.documentElement.scrollWidth,
						document.body?.scrollWidth ?? 0
					);
					const offenders: string[] = [];

					const clippedByScroller = (element: Element) => {
						let node = element.parentElement;
						while (node && node !== document.body) {
							const style = getComputedStyle(node);
							const overflowX = style.overflowX;
							if (
								(overflowX === 'auto' || overflowX === 'scroll') &&
								node.scrollWidth > node.clientWidth + 1
							) {
								const box = node.getBoundingClientRect();
								if (box.left >= -1 && box.right <= innerWidth + 1) return true;
							}
							node = node.parentElement;
						}
						return false;
					};

					for (const element of document.body.querySelectorAll('*')) {
						const rect = element.getBoundingClientRect();
						if (rect.width < 2 || rect.height < 2) continue;
						if (rect.right <= innerWidth + 1 || rect.left >= innerWidth - 1) continue;
						const style = getComputedStyle(element);
						if (style.display === 'none' || style.visibility === 'hidden') continue;
						if (clippedByScroller(element)) continue;
						if (offenders.length >= 6) break;
						const id = element.id ? `#${element.id}` : '';
						const className =
							typeof element.className === 'string'
								? element.className.trim().split(/\s+/).slice(0, 3).join('.')
								: '';
						offenders.push(
							`${element.tagName.toLowerCase()}${id}${className ? `.${className}` : ''} right=${Math.round(rect.right)}`
						);
					}

					return { scrollWidth, innerWidth, offenders };
				});

				expect(
					result.scrollWidth,
					`${route} at ${width}px scrollWidth ${result.scrollWidth} > ${result.innerWidth}`
				).toBeLessThanOrEqual(result.innerWidth);
				expect(result.offenders, result.offenders.join('\n')).toEqual([]);
			});
		}
	}
});

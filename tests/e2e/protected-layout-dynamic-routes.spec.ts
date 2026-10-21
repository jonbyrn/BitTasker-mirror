import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ retries: 2 });

const TASK_DETAIL_PATH = '/tasks/test-layout-task';
const SERVICE_DETAIL_PATH = '/services/test-layout-service';

function buildTaskEvent() {
	return {
		id: 'a'.repeat(64),
		pubkey: 'b'.repeat(64),
		created_at: 1_700_000_000,
		kind: 31000,
		tags: [['d', 'test-layout-task']],
		content: JSON.stringify({
			uniqueId: 'test-layout-task',
			title: 'Layout Test Task',
			description: 'A task for testing ProtectedLayout.',
			status: 'OPEN',
			budget: { amount: 100, currency: 'USD', type: 'FIXED' },
			attachments: [],
			deadline: '2030-01-01T00:00:00.000Z',
			categories: [{ id: 'cat', name: 'Development', slug: 'development' }],
			skills: ['Development']
		}),
		sig: 'c'.repeat(128)
	};
}

function buildServiceEvent() {
	return {
		id: 'd'.repeat(64),
		pubkey: 'e'.repeat(64),
		created_at: 1_700_000_000,
		kind: 30_402,
		tags: [
			['d', 'test-layout-service'],
			['s', 'active']
		],
		content: JSON.stringify({
			uniqueId: 'test-layout-service',
			title: 'Layout Test Service',
			description: 'A service for testing ProtectedLayout.',
			status: 'active',
			serviceLocationTypes: ['remote'],
			locationDetails: {},
			pricing: { type: 'FIXED', amount: 200, currency: 'USD' },
			skills: ['Design'],
			categories: [{ id: 'cat', name: 'Design', slug: 'design' }],
			portfolio: [],
			createdAt: 1_700_000_000,
			creator: { username: 'test-user', avatar: '' }
		}),
		sig: 'f'.repeat(128)
	};
}

async function mockEventsApi(page: Page, events: unknown[]) {
	await page.route('**/api/v1/events/request', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: events })
		});
	});

	await page.route('**/api/v1/events/**', async (route, request) => {
		if (request.method() === 'GET') {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: events[0] ?? null })
			});
			return;
		}
		await route.continue();
	});
}

async function clearAuth(page: Page) {
	await page.addInitScript(() => {
		window.localStorage.removeItem('CapacitorStorage.access_token');
		window.localStorage.removeItem('CapacitorStorage.npub');
	});
}

/**
 * Set up auth for e2e tests.
 * Uses addInitScript to set the Capacitor Preferences token, and mocks WebSocket
 * to prevent NDK relay connections from hanging.
 */
async function setAuth(page: Page) {
	await page.addInitScript(() => {
		window.localStorage.setItem('CapacitorStorage.access_token', 'e2e-test-token');
		window.localStorage.setItem('CapacitorStorage.npub', 'npub1test');
	});
	await page.addInitScript(() => {
		class StubWebSocket {
			static CONNECTING = 0;
			static OPEN = 1;
			static CLOSING = 2;
			static CLOSED = 3;
			readyState = 0;
			url = '';
			onopen: ((ev: Event) => void) | null = null;
			onclose: ((ev: CloseEvent) => void) | null = null;
			onerror: ((ev: Event) => void) | null = null;
			onmessage: ((ev: MessageEvent) => void) | null = null;
			constructor(url: string | URL) {
				this.url = typeof url === 'string' ? url : url.toString();
				setTimeout(() => {
					this.readyState = 1;
					this.onopen?.(new Event('open'));
				}, 1);
			}
			close() {
				this.readyState = 3;
			}
			send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
				if (typeof data === 'string') {
					try {
						const msg = JSON.parse(data);
						if (Array.isArray(msg) && msg[0] === 'REQ' && typeof msg[1] === 'string') {
							const subId = msg[1];
							setTimeout(() => {
								this.onmessage?.(
									new MessageEvent('message', { data: JSON.stringify(['EOSE', subId]) })
								);
							}, 1);
						}
					} catch {
						// not JSON
					}
				}
			}
			addEventListener(type: string, cb: EventListener) {
				(this as Record<string, unknown>)[`on${type}`] = cb;
			}
			removeEventListener() {}
			dispatchEvent() {
				return true;
			}
		}
		(window as Record<string, unknown>).WebSocket = StubWebSocket;
	});
}

test.describe('ProtectedLayout — dynamic route layout', () => {
	test.describe('Task detail — unauthenticated', () => {
		test('renders content without sidebar', async ({ page }) => {
			await clearAuth(page);
			await mockEventsApi(page, [buildTaskEvent()]);
			await page.goto(TASK_DETAIL_PATH, { waitUntil: 'domcontentloaded' });
			await page.waitForLoadState('networkidle');

			await expect(page.locator('body')).toBeVisible();

			const sidebar = page.locator('.protected-layout .fixed ul.menu');
			const sidebarVisible = await sidebar.isVisible().catch(() => false);
			expect(sidebarVisible).toBe(false);
		});
	});

	test.describe('Task detail — authenticated desktop', () => {
		test.use({ viewport: { width: 1440, height: 900 } });

		test('renders content with sidebar on desktop', async ({ page }) => {
			await setAuth(page);
			await mockEventsApi(page, [buildTaskEvent()]);

			await page.goto(TASK_DETAIL_PATH, { waitUntil: 'domcontentloaded' });

			const sidebar = page.locator('.protected-layout .fixed ul.menu');
			await expect(sidebar).toBeVisible({ timeout: 20000 });
		});

		test('sidebar has correct navigation sections', async ({ page }) => {
			await setAuth(page);
			await mockEventsApi(page, [buildTaskEvent()]);

			await page.goto(TASK_DETAIL_PATH, { waitUntil: 'domcontentloaded' });

			const sidebar = page.locator('.protected-layout .fixed ul.menu');
			await expect(sidebar).toBeVisible({ timeout: 20000 });

			const sidebarLinks = page.locator('.protected-layout ul.menu a');
			const count = await sidebarLinks.count();
			expect(count).toBeGreaterThanOrEqual(5);
		});
	});

	test.describe('Task detail — authenticated mobile', () => {
		test.use({ viewport: { width: 375, height: 667 } });

		test('does not render sidebar on mobile', async ({ page }) => {
			await setAuth(page);
			await mockEventsApi(page, [buildTaskEvent()]);

			await page.goto(TASK_DETAIL_PATH, { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);

			const sidebar = page.locator('.protected-layout .fixed ul.menu');
			const sidebarVisible = await sidebar.isVisible().catch(() => false);
			expect(sidebarVisible).toBe(false);
		});
	});

	test.describe('Service detail — unauthenticated', () => {
		test('renders content without sidebar', async ({ page }) => {
			await clearAuth(page);
			await mockEventsApi(page, [buildServiceEvent()]);
			await page.goto(SERVICE_DETAIL_PATH, { waitUntil: 'domcontentloaded' });
			await page.waitForLoadState('networkidle');

			await expect(page.locator('body')).toBeVisible();

			const sidebar = page.locator('.protected-layout .fixed ul.menu');
			const sidebarVisible = await sidebar.isVisible().catch(() => false);
			expect(sidebarVisible).toBe(false);
		});
	});

	test.describe('Service detail — authenticated desktop', () => {
		test.use({ viewport: { width: 1440, height: 900 } });

		test('renders the service without the account sidebar', async ({ page }) => {
			await setAuth(page);
			await mockEventsApi(page, [buildServiceEvent()]);

			await page.goto(SERVICE_DETAIL_PATH, { waitUntil: 'domcontentloaded' });
			await page.waitForLoadState('networkidle');

			const sidebar = page.locator('.protected-layout .fixed ul.menu');
			await expect(sidebar).toHaveCount(0);
		});
	});

	test.describe('Service detail — authenticated mobile', () => {
		test.use({ viewport: { width: 375, height: 667 } });

		test('does not render sidebar on mobile', async ({ page }) => {
			await setAuth(page);
			await mockEventsApi(page, [buildServiceEvent()]);

			await page.goto(SERVICE_DETAIL_PATH, { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(3000);

			const sidebar = page.locator('.protected-layout .fixed ul.menu');
			const sidebarVisible = await sidebar.isVisible().catch(() => false);
			expect(sidebarVisible).toBe(false);
		});
	});

	test.describe('No JS errors on dynamic routes', () => {
		test('task detail loads without JS errors', async ({ page }) => {
			const jsErrors: string[] = [];
			page.on('pageerror', (error) => {
				const message = error.message;
				if (
					message.includes('WebSocket') ||
					message.includes('ws://') ||
					message.includes('wss://')
				) {
					return;
				}
				jsErrors.push(message);
			});

			await mockEventsApi(page, [buildTaskEvent()]);
			await page.goto(TASK_DETAIL_PATH, { waitUntil: 'domcontentloaded' });
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(2000);

			expect(jsErrors, `JS errors on ${TASK_DETAIL_PATH}: ${jsErrors.join('; ')}`).toHaveLength(0);
		});

		test('service detail loads without JS errors', async ({ page }) => {
			const jsErrors: string[] = [];
			page.on('pageerror', (error) => {
				const message = error.message;
				if (
					message.includes('WebSocket') ||
					message.includes('ws://') ||
					message.includes('wss://')
				) {
					return;
				}
				jsErrors.push(message);
			});

			await mockEventsApi(page, [buildServiceEvent()]);
			await page.goto(SERVICE_DETAIL_PATH, { waitUntil: 'domcontentloaded' });
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(2000);

			expect(jsErrors, `JS errors on ${SERVICE_DETAIL_PATH}: ${jsErrors.join('; ')}`).toHaveLength(
				0
			);
		});
	});
});

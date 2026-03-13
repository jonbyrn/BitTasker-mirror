import { expect as baseExpect, type Page } from '@playwright/test';
import { activateAndWaitForURL } from './ios-interactions';

const NAVIGATION_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 25_000;
const POLL_INTERVALS = [250, 500, 1_000, 2_000] as const;
const SPA_PROBE_KEY = '__bitTaskerBottomNavSpaProbe';

export type BottomNavRouteConfig = {
	name: string;
	linkTestId: string;
	urlPattern: RegExp;
	rootTestId: string;
	readySelectors: string[];
	readyTimeoutMs?: number;
	verifyReady?: boolean;
	requireSpaNavigation?: boolean;
};

async function installSpaProbe(page: Page, routeName: string): Promise<string> {
	const value = `probe:${routeName}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
	await page.evaluate(
		({ key, probeValue }) => {
			(globalThis as Record<string, unknown>)[key] = probeValue;
		},
		{ key: SPA_PROBE_KEY, probeValue: value }
	);
	return value;
}

async function readSpaProbe(page: Page): Promise<string | null> {
	return page.evaluate((key) => {
		const value = (globalThis as Record<string, unknown>)[key];
		return typeof value === 'string' ? value : null;
	}, SPA_PROBE_KEY);
}

async function waitForVisibleSelector(
	page: Page,
	selectors: string[],
	timeoutMs = READY_TIMEOUT_MS
): Promise<void> {
	await baseExpect
		.poll(
			async () => {
				for (const selector of selectors) {
					if (
						await page
							.locator(selector)
							.first()
							.isVisible()
							.catch(() => false)
					) {
						return true;
					}
				}
				return false;
			},
			{ timeout: timeoutMs, intervals: [...POLL_INTERVALS] }
		)
		.toBe(true);
}

export async function navigateBottomNavTo(page: Page, route: BottomNavRouteConfig): Promise<void> {
	const link = page.getByTestId(route.linkTestId).first();
	const readyTimeoutMs = route.readyTimeoutMs ?? READY_TIMEOUT_MS;
	const spaProbeValue =
		route.requireSpaNavigation === false ? null : await installSpaProbe(page, route.name);

	await baseExpect
		.poll(() => link.isVisible().catch(() => false), {
			timeout: NAVIGATION_TIMEOUT_MS,
			intervals: [...POLL_INTERVALS]
		})
		.toBe(true);

	let navigated = false;
	const tryNativeClick = async (force: boolean): Promise<boolean> => {
		const waitForUrl = page
			.waitForURL(route.urlPattern, { timeout: NAVIGATION_TIMEOUT_MS })
			.then(() => true)
			.catch(() => false);
		await link
			.click({
				force,
				timeout: NAVIGATION_TIMEOUT_MS
			})
			.catch(() => {});
		return waitForUrl;
	};

	navigated = await tryNativeClick(true);
	if (!navigated) {
		navigated = await tryNativeClick(false);
	}
	if (!navigated) {
		await activateAndWaitForURL(page, link, route.urlPattern, NAVIGATION_TIMEOUT_MS);
		navigated = true;
	}

	baseExpect(navigated).toBe(true);
	await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
	await page.waitForLoadState('load', { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
	await baseExpect(page).toHaveURL(route.urlPattern);

	if (spaProbeValue) {
		await baseExpect
			.poll(() => readSpaProbe(page), {
				timeout: NAVIGATION_TIMEOUT_MS,
				intervals: [...POLL_INTERVALS]
			})
			.toBe(spaProbeValue);
	}

	await baseExpect(page.getByTestId(route.rootTestId)).toBeVisible({ timeout: readyTimeoutMs });

	if (route.verifyReady === false) {
		return;
	}

	await waitForVisibleSelector(page, route.readySelectors, readyTimeoutMs);
}

export const AUTHENTICATED_BOTTOM_NAV_ROUTES: Record<string, BottomNavRouteConfig> = {
	wallet: {
		name: 'wallet',
		linkTestId: 'bottom-nav-wallet-link',
		urlPattern: /\/dashboard\/wallet(?:\?.*)?$/,
		rootTestId: 'dashboard-wallet-page',
		readyTimeoutMs: 60_000,
		verifyReady: false,
		readySelectors: [
			'[data-testid="wallet-receive-trigger"]',
			'[data-testid="wallet-send-trigger"]',
			'[data-testid="wallet-retry-connection"]',
			'[data-testid="wallet-no-wallet-try-again"]'
		]
	},
	home: {
		name: 'home',
		linkTestId: 'bottom-nav-home-link',
		urlPattern: /\/dashboard(?:\?(.*&)?tab=[^&]+)?$/,
		rootTestId: 'dashboard-home-page',
		verifyReady: false,
		readySelectors: ['#panel-tasks', '[role="tablist"]', '[data-testid="dashboard-home-page"]']
	},
	createTask: {
		name: 'create-task',
		linkTestId: 'bottom-nav-create-task-link',
		urlPattern: /\/dashboard\/create-task(?:\?.*)?$/,
		rootTestId: 'dashboard-create-task-page',
		verifyReady: false,
		readySelectors: [
			'[data-testid="dashboard-create-task-page"] button',
			'[data-testid="dashboard-create-task-page"] .loading',
			'[data-testid="dashboard-create-task-page"]'
		]
	},
	messages: {
		name: 'messages',
		linkTestId: 'bottom-nav-messages-link',
		urlPattern: /\/dashboard\/messages(?:\/to\/[^/?#]+)?(?:\?.*)?$/,
		rootTestId: 'dashboard-messages-page',
		verifyReady: false,
		readySelectors: [
			'[data-testid="messages-new-message-button"]',
			'[data-testid="messages-retry-button"]',
			'[data-testid^="messages-conversation-"]',
			'[data-testid^="messages-skeleton-"]'
		]
	}
};

export const PUBLIC_BOTTOM_NAV_ROUTES: Record<string, BottomNavRouteConfig> = {
	tasks: {
		name: 'tasks',
		linkTestId: 'bottom-nav-public-home-link',
		urlPattern: /\/tasks(?:\/[^/?#]+)?(?:\?.*)?$/,
		rootTestId: 'public-tasks-page',
		readySelectors: [
			'[data-testid="tasks-scroll-container"]',
			'[data-testid="tasks-loading-state"]',
			'[data-testid="tasks-no-results-state"]',
			'[data-testid="tasks-error-state"]',
			'[data-testid="public-tasks-page"]'
		]
	},
	about: {
		name: 'about',
		linkTestId: 'bottom-nav-about-link',
		urlPattern: /\/about(?:\?.*)?$/,
		rootTestId: 'about-page',
		readySelectors: ['[data-testid="about-page"] h1', '[data-testid="about-page"]']
	},
	howItWorks: {
		name: 'how-it-works',
		linkTestId: 'bottom-nav-how-it-works-link',
		urlPattern: /\/how-it-works(?:\?.*)?$/,
		rootTestId: 'how-it-works-page',
		readySelectors: ['[data-testid="how-it-works-page"] h1', '[data-testid="how-it-works-page"]']
	},
	signup: {
		name: 'signup',
		linkTestId: 'bottom-nav-signup-link',
		urlPattern: /\/auth\/signup(?:\?.*)?$/,
		rootTestId: 'signup-page',
		readySelectors: ['[data-testid="signup-continue"]', '[data-testid="signup-page"]']
	}
};

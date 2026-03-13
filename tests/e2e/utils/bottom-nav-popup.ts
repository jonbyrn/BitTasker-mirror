import { expect as baseExpect, type Page } from '@playwright/test';
import {
	activate,
	activateAndWaitForURL,
	openBottomMenu,
	resolveMenuButton
} from './ios-interactions';

const NAVIGATION_TIMEOUT_MS = 30_000;
const READY_TIMEOUT_MS = 25_000;
const ACTION_NAVIGATION_TIMEOUT_MS = 10_000;
const POLL_INTERVALS = [250, 500, 1_000, 2_000] as const;

export type BottomNavPopupRouteConfig = {
	name: string;
	startPath: string;
	linkTestId: string;
	urlPattern: RegExp;
	rootTestId?: string;
	readySelectors?: string[];
	toggleTestId?: string;
	readyTimeoutMs?: number;
	verifyReady?: boolean;
};

async function ensurePopupLinkVisible(
	page: Page,
	route: BottomNavPopupRouteConfig
): Promise<ReturnType<Page['getByTestId']>> {
	await baseExpect
		.poll(
			() =>
				page
					.locator(
						'button[data-menu-button], .dock button[data-menu-button], footer button[data-menu-button]'
					)
					.first()
					.isVisible()
					.catch(() => false),
			{
				timeout: NAVIGATION_TIMEOUT_MS,
				intervals: [...POLL_INTERVALS]
			}
		)
		.toBe(true);

	await openBottomMenu(page);
	await baseExpect(page.getByTestId('bottom-nav-popup-panel')).toBeVisible({
		timeout: NAVIGATION_TIMEOUT_MS
	});

	const link = page.getByTestId(route.linkTestId).first();
	if (route.toggleTestId) {
		const toggle = page.getByTestId(route.toggleTestId).first();
		for (let attempt = 0; attempt < 4; attempt += 1) {
			const linkAlreadyVisible = await link.isVisible().catch(() => false);
			if (linkAlreadyVisible) {
				break;
			}
			if (attempt === 0) {
				await toggle.click({ force: true, timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
			} else if (attempt === 1) {
				await toggle.dispatchEvent('click').catch(() => {});
			} else if (attempt === 2) {
				await toggle
					.evaluate((element) => {
						if (element instanceof HTMLElement) {
							element.click();
						}
					})
					.catch(() => {});
			} else {
				await activate(toggle).catch(() => {});
			}
			const becameVisible = await baseExpect
				.poll(() => link.isVisible().catch(() => false), {
					timeout: 5_000,
					intervals: [...POLL_INTERVALS]
				})
				.toBe(true)
				.then(() => true)
				.catch(() => false);
			if (becameVisible) {
				break;
			}
		}
	}

	await baseExpect
		.poll(() => link.count().catch(() => 0), {
			timeout: NAVIGATION_TIMEOUT_MS,
			intervals: [...POLL_INTERVALS]
		})
		.toBeGreaterThan(0);
	await link.scrollIntoViewIfNeeded().catch(() => {});
	await baseExpect
		.poll(() => link.isVisible().catch(() => false), {
			timeout: NAVIGATION_TIMEOUT_MS,
			intervals: [...POLL_INTERVALS]
		})
		.toBe(true);

	return link;
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

export async function waitForBottomNavPopupReady(page: Page): Promise<void> {
	const button = await resolveMenuButton(page, NAVIGATION_TIMEOUT_MS);
	await baseExpect(button).toBeVisible({ timeout: NAVIGATION_TIMEOUT_MS });
	await button.scrollIntoViewIfNeeded().catch(() => {});
}

export async function navigateBottomNavPopupTo(
	page: Page,
	route: BottomNavPopupRouteConfig
): Promise<void> {
	const readyTimeoutMs = route.readyTimeoutMs ?? READY_TIMEOUT_MS;
	const link = await ensurePopupLinkVisible(page, route);

	const waitForMatchedUrl = async (timeoutMs = ACTION_NAVIGATION_TIMEOUT_MS): Promise<boolean> =>
		baseExpect
			.poll(() => page.url(), { timeout: timeoutMs, intervals: [...POLL_INTERVALS] })
			.toMatch(route.urlPattern)
			.then(() => true)
			.catch(() => false);

	const tryNativeDomClick = async (): Promise<boolean> => {
		await link
			.evaluate((element) => {
				if (element instanceof HTMLElement) {
					element.click();
				}
			})
			.catch(() => {});
		return waitForMatchedUrl();
	};

	const tryDispatchedClick = async (): Promise<boolean> => {
		await link.dispatchEvent('click').catch(() => {});
		return waitForMatchedUrl();
	};

	const tryPlaywrightClick = async (force: boolean): Promise<boolean> => {
		await link
			.click({
				force,
				timeout: NAVIGATION_TIMEOUT_MS,
				noWaitAfter: true
			})
			.catch(() => {});
		return waitForMatchedUrl();
	};

	let navigated = await tryNativeDomClick();
	if (!navigated) {
		navigated = await tryDispatchedClick();
	}
	if (!navigated) {
		navigated = await tryPlaywrightClick(true);
	}
	if (!navigated) {
		navigated = await tryPlaywrightClick(false);
	}
	if (!navigated) {
		await activateAndWaitForURL(page, link, route.urlPattern, NAVIGATION_TIMEOUT_MS);
	}
	await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});
	await page.waitForLoadState('load', { timeout: NAVIGATION_TIMEOUT_MS }).catch(() => {});
	await baseExpect(page).toHaveURL(route.urlPattern);
	if (route.verifyReady === false) {
		return;
	}
	if (route.readySelectors?.length) {
		await waitForVisibleSelector(page, route.readySelectors, readyTimeoutMs);
		return;
	}
	if (route.rootTestId) {
		await baseExpect(page.getByTestId(route.rootTestId)).toBeVisible({ timeout: readyTimeoutMs });
	}
}

export const PUBLIC_BOTTOM_NAV_POPUP_ROUTES: Record<string, BottomNavPopupRouteConfig> = {
	login: {
		name: 'login',
		startPath: '/tasks',
		linkTestId: 'bottom-nav-popup-login-link',
		urlPattern: /\/auth\/login(?:\?.*)?$/,
		verifyReady: false
	},
	signup: {
		name: 'signup',
		startPath: '/tasks',
		linkTestId: 'bottom-nav-popup-signup-link',
		urlPattern: /\/auth\/signup(?:\?.*)?$/,
		verifyReady: false
	},
	tasks: {
		name: 'tasks',
		startPath: '/about',
		linkTestId: 'bottom-nav-popup-public-home-link',
		urlPattern: /\/tasks(?:\/[^/?#]+)?(?:\?.*)?$/,
		verifyReady: false
	},
	howItWorks: {
		name: 'how-it-works',
		startPath: '/tasks',
		linkTestId: 'bottom-nav-popup-public-how-it-works-link',
		urlPattern: /\/how-it-works(?:\?.*)?$/,
		verifyReady: false
	}
};

export const AUTHENTICATED_BOTTOM_NAV_POPUP_ROUTES: Record<string, BottomNavPopupRouteConfig> = {
	findTasks: {
		name: 'find-tasks',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-task-management-toggle',
		linkTestId: 'bottom-nav-popup-find-tasks-link',
		urlPattern: /\/tasks(?:\/[^/?#]+)?(?:\?.*)?$/,
		rootTestId: 'public-tasks-page',
		readySelectors: ['[data-testid="public-tasks-page"]']
	},
	myTasks: {
		name: 'my-tasks',
		startPath: '/dashboard/messages',
		toggleTestId: 'bottom-nav-popup-task-management-toggle',
		linkTestId: 'bottom-nav-popup-my-tasks-link',
		urlPattern: /\/dashboard(?:\?(.*&)?tab=[^&]+)?$/,
		rootTestId: 'dashboard-home-page',
		readySelectors: ['[data-testid="dashboard-home-page"]', '#panel-tasks', '[role="tablist"]']
	},
	createTask: {
		name: 'create-task',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-task-management-toggle',
		linkTestId: 'bottom-nav-popup-create-task-link',
		urlPattern: /\/dashboard\/create-task(?:\?.*)?$/,
		rootTestId: 'dashboard-create-task-page',
		readySelectors: ['[data-testid="dashboard-create-task-page"]']
	},
	messages: {
		name: 'messages',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-account-toggle',
		linkTestId: 'bottom-nav-popup-messages-link',
		urlPattern: /\/dashboard\/messages(?:\/to\/[^/?#]+)?(?:\?.*)?$/,
		rootTestId: 'dashboard-messages-page',
		readySelectors: [
			'[data-testid="dashboard-messages-page"]',
			'[data-testid="messages-new-message-button"]',
			'[data-testid="messages-retry-button"]',
			'[data-testid^="messages-conversation-"]',
			'button:has-text("New Message")',
			'button:has-text("Start New Message")'
		]
	},
	wallet: {
		name: 'wallet',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-account-toggle',
		linkTestId: 'bottom-nav-popup-wallet-link',
		urlPattern: /\/dashboard\/wallet(?:\?.*)?$/,
		verifyReady: false
	},
	profile: {
		name: 'profile',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-account-toggle',
		linkTestId: 'bottom-nav-popup-profile-link',
		urlPattern: /\/dashboard\/profile(?:\?.*)?$/,
		rootTestId: 'dashboard-profile-page',
		readySelectors: ['[data-testid="dashboard-profile-page"]', 'h3:has-text("Profile")']
	},
	settings: {
		name: 'settings',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-account-toggle',
		linkTestId: 'bottom-nav-popup-settings-link',
		urlPattern: /\/dashboard\/settings(?:\?.*)?$/,
		rootTestId: 'dashboard-settings-page',
		readySelectors: ['[data-testid="dashboard-settings-page"]', 'h3:has-text("Settings")']
	}
};

export const AUTHENTICATED_SUPPORT_POPUP_ROUTES: BottomNavPopupRouteConfig[] = [
	{
		name: 'support-how-it-works',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-support-toggle',
		linkTestId: 'bottom-nav-popup-how-it-works-link',
		urlPattern: /\/how-it-works(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'support-faq',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-support-toggle',
		linkTestId: 'bottom-nav-popup-faq-link',
		urlPattern: /\/faq(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'support-contact',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-support-toggle',
		linkTestId: 'bottom-nav-popup-contact-link',
		urlPattern: /\/contact(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'support-feedback',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-support-toggle',
		linkTestId: 'bottom-nav-popup-feedback-link',
		urlPattern: /\/feedback(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'support-security',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-support-toggle',
		linkTestId: 'bottom-nav-popup-security-link',
		urlPattern: /\/security(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'support-about',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-support-toggle',
		linkTestId: 'bottom-nav-popup-about-link',
		urlPattern: /\/about(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'support-terms',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-support-toggle',
		linkTestId: 'bottom-nav-popup-terms-link',
		urlPattern: /\/terms(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'support-privacy',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-support-toggle',
		linkTestId: 'bottom-nav-popup-privacy-link',
		urlPattern: /\/privacy(?:\?.*)?$/,
		verifyReady: false
	}
];

export const AUTHENTICATED_TASK_MANAGEMENT_EXTRA_POPUP_ROUTES: BottomNavPopupRouteConfig[] = [
	{
		name: 'bids-sent',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-task-management-toggle',
		linkTestId: 'bottom-nav-popup-bids-link',
		urlPattern: /\/dashboard(?:\?(.*&)?tab=bids(?:&.*)?)?$/,
		verifyReady: false
	},
	{
		name: 'contracts',
		startPath: '/dashboard',
		toggleTestId: 'bottom-nav-popup-task-management-toggle',
		linkTestId: 'bottom-nav-popup-contracts-link',
		urlPattern: /\/dashboard(?:\?(.*&)?tab=contracts(?:&.*)?)?$/,
		verifyReady: false
	}
];

export const AUTHENTICATED_QUICK_ACTION_POPUP_ROUTES: BottomNavPopupRouteConfig[] = [
	{
		name: 'quick-find-tasks',
		startPath: '/dashboard',
		linkTestId: 'bottom-nav-popup-quick-find-tasks-link',
		urlPattern: /\/tasks(?:\/[^/?#]+)?(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'quick-contracts',
		startPath: '/dashboard',
		linkTestId: 'bottom-nav-popup-quick-contracts-link',
		urlPattern: /\/dashboard(?:\?(.*&)?tab=contracts(?:&.*)?)?$/,
		verifyReady: false
	},
	{
		name: 'quick-bids',
		startPath: '/dashboard',
		linkTestId: 'bottom-nav-popup-quick-bids-link',
		urlPattern: /\/dashboard(?:\?(.*&)?tab=bids(?:&.*)?)?$/,
		verifyReady: false
	}
];

export const PUBLIC_TASKERS_POPUP_ROUTES: BottomNavPopupRouteConfig[] = [
	{
		name: 'public-post-task',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-taskers-toggle',
		linkTestId: 'bottom-nav-popup-public-post-task-link',
		urlPattern: /\/(?:auth\/login|dashboard\/create-task)(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-tasker-fees',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-taskers-toggle',
		linkTestId: 'bottom-nav-popup-public-taskee-fees-link',
		urlPattern: /\/taskee-fees(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-secure-payments',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-taskers-toggle',
		linkTestId: 'bottom-nav-popup-public-secure-payments-link',
		urlPattern: /\/secure-payments(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-taskers-faq',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-taskers-toggle',
		linkTestId: 'bottom-nav-popup-public-taskers-faq-link',
		urlPattern: /\/faq(?:\?.*)?$/,
		verifyReady: false
	}
];

export const PUBLIC_TASKEES_POPUP_ROUTES: BottomNavPopupRouteConfig[] = [
	{
		name: 'public-start-earning',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-taskees-toggle',
		linkTestId: 'bottom-nav-popup-public-start-earning-link',
		urlPattern: /\/tasks(?:\/[^/?#]+)?(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-community-guidelines',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-taskees-toggle',
		linkTestId: 'bottom-nav-popup-public-community-guidelines-link',
		urlPattern: /\/community-guidelines(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-taskees-fees',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-taskees-toggle',
		linkTestId: 'bottom-nav-popup-public-taskees-fees-link',
		urlPattern: /\/taskee-fees(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-tasker-principles',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-taskees-toggle',
		linkTestId: 'bottom-nav-popup-public-tasker-principles-link',
		urlPattern: /\/tasker-principles(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-taskees-faq',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-taskees-toggle',
		linkTestId: 'bottom-nav-popup-public-taskees-faq-link',
		urlPattern: /\/faq(?:\?.*)?$/,
		verifyReady: false
	}
];

export const PUBLIC_COMPANY_POPUP_ROUTES: BottomNavPopupRouteConfig[] = [
	{
		name: 'public-about',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-company-toggle',
		linkTestId: 'bottom-nav-popup-public-about-link',
		urlPattern: /\/about(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-security',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-company-toggle',
		linkTestId: 'bottom-nav-popup-public-security-link',
		urlPattern: /\/security(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-careers',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-company-toggle',
		linkTestId: 'bottom-nav-popup-public-careers-link',
		urlPattern: /\/careers(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-press',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-company-toggle',
		linkTestId: 'bottom-nav-popup-public-press-link',
		urlPattern: /\/press(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-terms',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-company-toggle',
		linkTestId: 'bottom-nav-popup-public-terms-link',
		urlPattern: /\/terms(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-privacy',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-company-toggle',
		linkTestId: 'bottom-nav-popup-public-privacy-link',
		urlPattern: /\/privacy(?:\?.*)?$/,
		verifyReady: false
	},
	{
		name: 'public-contact',
		startPath: '/tasks',
		toggleTestId: 'bottom-nav-popup-public-company-toggle',
		linkTestId: 'bottom-nav-popup-public-contact-link',
		urlPattern: /\/contact(?:\?.*)?$/,
		verifyReady: false
	}
];

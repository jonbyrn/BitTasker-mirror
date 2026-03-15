/**
 * Deterministic Wait Utilities for E2E Testing
 *
 * Provides reliable wait mechanisms instead of magic sleeps
 */

import { Page, expect } from '@playwright/test';

export const WAIT_CONFIG = {
	shortWait: 500,
	standardWait: 1000,
	mediumWait: 2000,
	longWait: 5000,
	veryLongWait: 10000,
	maxTimeout: 30000
};

/**
 * Wait for element with retry logic
 */
export async function waitForElement(
	page: Page,
	selector: string,
	options?: {
		timeout?: number;
		retries?: number;
		retryDelay?: number;
		visible?: boolean;
	}
): Promise<void> {
	const {
		timeout = WAIT_CONFIG.maxTimeout,
		retries = 3,
		retryDelay = 200,
		visible = false
	} = options || {};

	let lastError: Error | null = null;

	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			if (visible) {
				await page.locator(selector).waitFor({ state: 'visible', timeout });
			} else {
				await page.locator(selector).waitFor({ state: 'attached', timeout });
			}
			return;
		} catch (error) {
			lastError = error as Error;
			if (attempt < retries - 1) {
				await page.waitForTimeout(retryDelay);
			}
		}
	}

	throw lastError || new Error(`Element ${selector} not found after ${retries} retries`);
}

/**
 * Wait for element to disappear
 */
export async function waitForElementHidden(
	page: Page,
	selector: string,
	timeout = WAIT_CONFIG.maxTimeout
): Promise<void> {
	await page.locator(selector).waitFor({ state: 'hidden', timeout });
}

/**
 * Wait for element to be enabled
 */
export async function waitForElementEnabled(
	page: Page,
	selector: string,
	timeout = WAIT_CONFIG.maxTimeout
): Promise<void> {
	const element = page.locator(selector);
	await element.waitFor({ state: 'visible', timeout });

	// Wait for element to be enabled
	let attempts = 0;
	while (attempts < 10) {
		const isDisabled = await element.evaluate((el) => {
			const button = el as HTMLButtonElement;
			return button.disabled || button.hasAttribute('disabled');
		});

		if (!isDisabled) return;
		await page.waitForTimeout(100);
		attempts++;
	}
}

/**
 * Wait for element text to match pattern
 */
export async function waitForElementText(
	page: Page,
	selector: string,
	pattern: string | RegExp,
	timeout = WAIT_CONFIG.maxTimeout
): Promise<void> {
	const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		const text = await page.locator(selector).textContent();
		if (text && regex.test(text)) {
			return;
		}
		await page.waitForTimeout(100);
	}

	throw new Error(`Text matching ${pattern} not found in ${selector}`);
}

/**
 * Wait for network load state
 */
export async function waitForNetworkIdle(page: Page, timeout = WAIT_CONFIG.maxTimeout): Promise<void> {
	try {
		await page.waitForLoadState('networkidle', { timeout });
	} catch {
		// If networkidle times out, fallback to just waiting a bit
		await page.waitForTimeout(WAIT_CONFIG.standardWait);
	}
}

/**
 * Wait for JavaScript to settle (dom settled)
 */
export async function waitForDomSettled(page: Page, timeout = WAIT_CONFIG.maxTimeout): Promise<void> {
	await page.waitForLoadState('domcontentloaded', { timeout });
}

/**
 * Wait for multiple elements
 */
export async function waitForElements(
	page: Page,
	selectors: string[],
	timeout = WAIT_CONFIG.maxTimeout
): Promise<void> {
	await Promise.all(
		selectors.map((selector) =>
			page.locator(selector).waitFor({ state: 'attached', timeout })
		)
	);
}

/**
 * Wait for element count to match
 */
export async function waitForElementCount(
	page: Page,
	selector: string,
	expectedCount: number,
	timeout = WAIT_CONFIG.maxTimeout
): Promise<void> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		const count = await page.locator(selector).count();
		if (count === expectedCount) {
			return;
		}
		await page.waitForTimeout(100);
	}

	throw new Error(`Expected ${expectedCount} elements with selector ${selector}`);
}

/**
 * Wait for input value to change
 */
export async function waitForInputValue(
	page: Page,
	selector: string,
	expectedValue: string,
	timeout = WAIT_CONFIG.maxTimeout
): Promise<void> {
	const startTime = Date.now();

	while (Date.now() - startTime < timeout) {
		const value = await page.locator(selector).inputValue();
		if (value === expectedValue) {
			return;
		}
		await page.waitForTimeout(100);
	}

	throw new Error(`Input ${selector} value did not change to ${expectedValue}`);
}

/**
 * Wait for button to be clickable
 */
export async function waitForClickable(
	page: Page,
	selector: string,
	timeout = WAIT_CONFIG.maxTimeout
): Promise<void> {
	const element = page.locator(selector);
	await element.waitFor({ state: 'visible', timeout });

	// Verify element is not disabled
	await waitForElementEnabled(page, selector, timeout);
}

/**
 * Safe click with retries
 */
export async function clickWithRetry(
	page: Page,
	selector: string,
	options?: {
		retries?: number;
		retryDelay?: number;
		timeout?: number;
		force?: boolean;
	}
): Promise<void> {
	const { retries = 3, retryDelay = 200, timeout = WAIT_CONFIG.maxTimeout, force = false } = options || {};

	let lastError: Error | null = null;

	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			const element = page.locator(selector);
			await element.waitFor({ state: 'visible', timeout });

			if (!force) {
				// Check if clickable
				const isClickable = await element.evaluate((el) => {
					const button = el as HTMLButtonElement;
					const style = window.getComputedStyle(el);
					return (
						!button.disabled &&
						!button.hasAttribute('disabled') &&
						style.display !== 'none' &&
						style.visibility !== 'hidden' &&
						style.pointerEvents !== 'none'
					);
				});

				if (!isClickable && attempt < retries - 1) {
					await page.waitForTimeout(retryDelay);
					continue;
				}
			}

			await element.click({ force });
			return;
		} catch (error) {
			lastError = error as Error;
			if (attempt < retries - 1) {
				await page.waitForTimeout(retryDelay);
			}
		}
	}

	throw lastError || new Error(`Failed to click ${selector} after ${retries} retries`);
}

/**
 * Wait for input to be focusable and set value with retry
 */
export async function fillInputWithRetry(
	page: Page,
	selector: string,
	value: string,
	options?: {
		retries?: number;
		retryDelay?: number;
		timeout?: number;
		delay?: number;
	}
): Promise<void> {
	const { retries = 3, retryDelay = 200, timeout = WAIT_CONFIG.maxTimeout, delay = 0 } = options || {};

	let lastError: Error | null = null;

	for (let attempt = 0; attempt < retries; attempt++) {
		try {
			const input = page.locator(selector);
			await input.waitFor({ state: 'visible', timeout });

			// Clear and fill
			await input.fill('');
			await input.fill(value, { delay });

			// Verify value was set
			const actualValue = await input.inputValue();
			if (actualValue === value) {
				return;
			}

			if (attempt < retries - 1) {
				await page.waitForTimeout(retryDelay);
			}
		} catch (error) {
			lastError = error as Error;
			if (attempt < retries - 1) {
				await page.waitForTimeout(retryDelay);
			}
		}
	}

	throw lastError || new Error(`Failed to fill input ${selector} with value ${value}`);
}

/**
 * Wait for browser console message
 */
export async function waitForConsoleMessage(
	page: Page,
	pattern: string | RegExp,
	timeout = WAIT_CONFIG.maxTimeout,
	type: 'log' | 'error' | 'warn' | 'info' = 'log'
): Promise<string> {
	const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
	const messages: string[] = [];

	return new Promise((resolve, reject) => {
		const handler = (msg: any) => {
			const text = msg.text();
			messages.push(text);
			if (regex.test(text)) {
				page.off('console', handler);
				clearTimeout(timeoutHandle);
				resolve(text);
			}
		};

		page.on('console', handler);

		const timeoutHandle = setTimeout(() => {
			page.off('console', handler);
			reject(new Error(`Console message matching ${pattern} not found. Got: ${messages.join(', ')}`));
		}, timeout);
	});
}

/**
 * Wait for navigation
 */
export async function waitForNavigation(
	page: Page,
	action: () => Promise<void>,
	timeout = WAIT_CONFIG.maxTimeout
): Promise<void> {
	const navigationPromise = page.waitForNavigation({ timeout });
	await action();
	await navigationPromise;
}

/**
 * Verify element is in viewport
 */
export async function isInViewport(page: Page, selector: string): Promise<boolean> {
	return page.locator(selector).evaluate((el) => {
		const rect = el.getBoundingClientRect();
		return (
			rect.top >= 0 &&
			rect.left >= 0 &&
			rect.bottom <= window.innerHeight &&
			rect.right <= window.innerWidth
		);
	});
}

/**
 * Scroll element into view
 */
export async function scrollIntoView(page: Page, selector: string): Promise<void> {
	await page.locator(selector).scrollIntoViewIfNeeded();
}

/**
 * Wait for validation error to appear
 */
export async function waitForValidationError(
	page: Page,
	formSelector: string,
	timeout = WAIT_CONFIG.maxTimeout
): Promise<string> {
	const errorSelectors = [
		`${formSelector} [data-testid="error-message"]`,
		`${formSelector} [role="alert"]`,
		`${formSelector} .error`,
		`${formSelector} .form-error`
	];

	for (const selector of errorSelectors) {
		try {
			const element = page.locator(selector);
			await element.waitFor({ state: 'visible', timeout: 500 });
			return await element.textContent() || '';
		} catch {
			// Continue to next selector
		}
	}

	throw new Error(`No validation error found in ${formSelector}`);
}

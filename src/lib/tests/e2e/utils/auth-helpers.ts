import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Authentication Helper Utilities for E2E Tests
 * Handles authentication state management, virtual authenticators, and session persistence
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_STATE_DIR = path.join(__dirname, '../.auth');
const AUTH_STATE_FILE = path.join(AUTH_STATE_DIR, 'test-user.json');

export class AuthHelper {
	constructor(private page: Page) {}

	/**
	 * Save authentication state (cookies, localStorage) to file
	 * This allows reusing authentication across test runs
	 */
	async saveAuthState(): Promise<void> {
		try {
			// Ensure directory exists
			if (!fs.existsSync(AUTH_STATE_DIR)) {
				fs.mkdirSync(AUTH_STATE_DIR, { recursive: true });
			}

			// Save storage state
			const storageState = await this.page.context().storageState();
			fs.writeFileSync(AUTH_STATE_FILE, JSON.stringify(storageState, null, 2));
			console.log(`Auth state saved to ${AUTH_STATE_FILE}`);
		} catch (error) {
			console.error('Failed to save auth state:', error);
			throw error;
		}
	}

	/**
	 * Load saved authentication state
	 * Returns true if state was loaded, false if no state exists
	 */
	async loadAuthState(): Promise<boolean> {
		try {
			if (!fs.existsSync(AUTH_STATE_FILE)) {
				return false;
			}

			const storageState = JSON.parse(fs.readFileSync(AUTH_STATE_FILE, 'utf-8'));
			await this.page.context().addCookies(storageState.cookies || []);

			// Restore localStorage
			if (storageState.origins && storageState.origins.length > 0) {
				const origin = storageState.origins[0];
				if (origin.localStorage) {
					await this.page.goto(origin.origin);
					await this.page.evaluate((localStorage) => {
						for (const item of localStorage) {
							window.localStorage.setItem(item.name, item.value);
						}
					}, origin.localStorage);
				}
			}

			console.log(`Auth state loaded from ${AUTH_STATE_FILE}`);
			return true;
		} catch (error) {
			console.warn('Failed to load auth state:', error);
			return false;
		}
	}

	/**
	 * Check if auth state file exists and is valid
	 */
	static authStateExists(): boolean {
		try {
			if (!fs.existsSync(AUTH_STATE_FILE)) {
				return false;
			}

			const storageState = JSON.parse(fs.readFileSync(AUTH_STATE_FILE, 'utf-8'));
			return storageState && typeof storageState === 'object';
		} catch {
			return false;
		}
	}

	/**
	 * Authenticate using Playwright virtual authenticator (WebAuthn)
	 * This simulates passkey authentication without requiring real biometrics
	 */
	async authenticateWithVirtualPasskey(): Promise<void> {
		// Create virtual authenticator
		const authenticatorId = await this.page.evaluate(async () => {
			const authenticatorId = await (
				window as unknown as {
					playwright: {
						createVirtualAuthenticator: (options: Record<string, unknown>) => Promise<string>;
					};
				}
			).playwright.createVirtualAuthenticator({
				protocol: 'ctap2',
				transport: 'usb',
				hasResidentKey: true,
				hasUserVerification: true,
				isUserVerified: true
			});
			return authenticatorId;
		});

		if (!authenticatorId) {
			throw new Error('Failed to create virtual authenticator');
		}

		// Navigate to login page
		await this.page.goto('/auth/login');

		// Click biometric/passkey button
		const biometricButton = this.page
			.locator('button:has-text("Biometric"), button:has-text("Passkey")')
			.first();
		if (await biometricButton.isVisible()) {
			await biometricButton.click();

			// Wait for authentication to complete
			await this.page.waitForURL(/.*\/hiring/, { timeout: 10000 });

			// Save auth state
			await this.saveAuthState();
		} else {
			throw new Error('Biometric authentication button not found');
		}
	}

	/**
	 * Bypass authentication for wallet-specific tests
	 * This is a fast method that skips actual authentication
	 * Use only when authentication is not the focus of the test
	 */
	async bypassAuthentication(): Promise<void> {
		// Set authentication flags in localStorage
		await this.page.goto('/');
		await this.page.evaluate(() => {
			// Set mock authentication state
			localStorage.setItem(
				'auth',
				JSON.stringify({
					authenticated: true,
					userId: 'test-user-id',
					timestamp: Date.now()
				})
			);
		});

		// Save auth state for reuse
		await this.saveAuthState();
	}

	/**
	 * Login with Nostr private key
	 * Fallback authentication method when passkey is not available
	 */
	async loginWithNostrKey(nsecKey?: string): Promise<void> {
		const testKey =
			nsecKey ||
			process.env.TEST_NOSTR_KEY ||
			'nsec1testkey123456789012345678901234567890123456789012345678901234567890';

		await this.page.goto('/auth/login');

		// Fill in Nostr private key
		const nsecInput = this.page
			.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
			.first();
		await expect(nsecInput).toBeVisible({ timeout: 5000 });
		await nsecInput.fill(testKey);

		// Submit login
		const submitButton = this.page
			.locator('button[type="submit"], button:has-text("Login")')
			.first();
		await submitButton.click();

		// Wait for redirect to hiring or success
		await this.page.waitForURL(/.*\/hiring/, { timeout: 10000 }).catch(async () => {
			// If redirect doesn't happen, check for success message
			const successMessage = this.page.locator('.alert-success, .success, [data-testid="success"]');
			if (await successMessage.isVisible()) {
				return;
			}
			throw new Error('Login failed - no redirect or success message');
		});

		// Save auth state
		await this.saveAuthState();
	}

	/**
	 * Check if user is authenticated
	 */
	async isAuthenticated(): Promise<boolean> {
		try {
			// Wait a bit for any redirects to complete
			await this.page.waitForTimeout(2000);

			// Check current URL - if we're on dashboard or any protected route, we're authenticated
			const currentUrl = this.page.url();

			// If redirected to login/register, not authenticated
			if (currentUrl.includes('/auth/login') || currentUrl.includes('/auth/register')) {
				return false;
			}

			// If we're on hiring or any protected route (not auth routes), we're authenticated
			if (
				currentUrl.includes('/hiring') ||
				currentUrl.includes('/earning') ||
				currentUrl.includes('/wallet') ||
				currentUrl.includes('/auth/onboarding') ||
				(currentUrl.includes('localhost') && !currentUrl.includes('/auth/'))
			) {
				// Try to find any app content
				// Wait for page to load
				await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

				// Check for common app elements or just that we're not on login
				const bodyText = await this.page
					.locator('body')
					.textContent()
					.catch(() => '');
				const hasAppContent =
					bodyText &&
					(bodyText.includes('Tasks') ||
						bodyText.includes('Wallet') ||
						currentUrl.includes('/hiring') ||
						currentUrl.includes('/earning'));

				return hasAppContent || !currentUrl.includes('/auth/login');
			}

			return false;
		} catch (error) {
			console.warn('Authentication check error:', error);
			// If we can't determine, check URL - if not on login, assume authenticated
			const currentUrl = this.page.url();
			return !currentUrl.includes('/auth/login') && !currentUrl.includes('/auth/register');
		}
	}

	/**
	 * Ensure user is authenticated, using saved state or authenticating if needed
	 */
	async ensureAuthenticated(method: 'virtual' | 'nostr' | 'bypass' = 'virtual'): Promise<void> {
		// Try to load saved auth state first
		const loaded = await this.loadAuthState();

		if (loaded) {
			// Verify auth state is still valid
			const isAuth = await this.isAuthenticated();
			if (isAuth) {
				console.log('Using saved authentication state');
				return;
			}
			console.log('Saved auth state expired, re-authenticating...');
		}

		// Authenticate using specified method
		switch (method) {
			case 'virtual':
				await this.authenticateWithVirtualPasskey();
				break;
			case 'nostr':
				await this.loginWithNostrKey();
				break;
			case 'bypass':
				await this.bypassAuthentication();
				break;
			default:
				throw new Error(`Unknown authentication method: ${method}`);
		}
	}

	/**
	 * Logout user and clear auth state
	 */
	async logout(): Promise<void> {
		// Navigate to hiring
		await this.page.goto('/hiring');

		// Look for user menu
		const userMenu = this.page
			.locator('.user-menu, .profile-dropdown, [data-testid="user-menu"]')
			.first();

		if (await userMenu.isVisible()) {
			await userMenu.click();

			// Click logout
			const logoutButton = this.page
				.locator('button:has-text("Logout"), a:has-text("Logout")')
				.first();
			if (await logoutButton.isVisible()) {
				await logoutButton.click();
				await this.page.waitForURL(/.*\/|\/auth\/login/, { timeout: 5000 });
			}
		}

		// Clear auth state file
		if (fs.existsSync(AUTH_STATE_FILE)) {
			fs.unlinkSync(AUTH_STATE_FILE);
		}
	}
}

/**
 * Create an auth helper instance
 */
export function createAuthHelper(page: Page): AuthHelper {
	return new AuthHelper(page);
}

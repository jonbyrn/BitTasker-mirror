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
			if (!fs.existsSync(AUTH_STATE_DIR)) {
				fs.mkdirSync(AUTH_STATE_DIR, { recursive: true });
			}
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

	async authenticateWithVirtualPasskey(): Promise<void> {
		const authenticatorId = await this.page.evaluate(async () => {
			// @ts-expect-error - Playwright's virtual authenticator API
			const id = await window.playwright?.createVirtualAuthenticator({
				protocol: 'ctap2',
				transport: 'usb',
				hasResidentKey: true,
				hasUserVerification: true,
				isUserVerified: true
			});
			return id;
		});
		if (!authenticatorId) {
			throw new Error('Failed to create virtual authenticator');
		}
		await this.page.goto('/auth/login');
		const biometricButton = this.page
			.locator('button:has-text("Biometric"), button:has-text("Passkey")')
			.first();
		if (await biometricButton.isVisible()) {
			await biometricButton.click();
			await this.page.waitForURL(/.*\/dashboard/, { timeout: 10000 });
			await this.saveAuthState();
		} else {
			throw new Error('Biometric authentication button not found');
		}
	}

	async bypassAuthentication(): Promise<void> {
		await this.page.goto('/');
		await this.page.evaluate(() => {
			localStorage.setItem(
				'auth',
				JSON.stringify({
					authenticated: true,
					userId: 'test-user-id',
					timestamp: Date.now()
				})
			);
		});
		await this.saveAuthState();
	}

	async loginWithNostrKey(nsecKey?: string): Promise<void> {
		const testKey = nsecKey || process.env.TEST_NOSTR_KEY;
		if (!testKey) {
			throw new Error(
				'No nsec key provided. Set TEST_NOSTR_KEY env var or pass nsecKey to loginWithNostrKey(). ' +
					'See tests/e2e/fixtures/test-nostr-keypair.ts for the default test key.'
			);
		}
		await this.page.goto('/auth/login');
		const nsecInput = this.page
			.locator('input[placeholder*="nsec"], input[name*="nsec"], textarea[placeholder*="nsec"]')
			.first();
		await expect(nsecInput).toBeVisible({ timeout: 5000 });
		await nsecInput.fill(testKey);
		const submitButton = this.page
			.locator('button[type="submit"], button:has-text("Login")')
			.first();
		await submitButton.click();
		await this.page.waitForURL(/.*\/dashboard/, { timeout: 10000 }).catch(() => {
			const successMessage = this.page.locator('.alert-success, .success, [data-testid="success"]');
			if (successMessage.isVisible()) {
				return;
			}
			throw new Error('Login failed - no redirect or success message');
		});
		await this.saveAuthState();
	}

	async isAuthenticated(): Promise<boolean> {
		try {
			await this.page.waitForTimeout(2000);
			const currentUrl = this.page.url();
			if (currentUrl.includes('/auth/login') || currentUrl.includes('/auth/register')) {
				return false;
			}
			if (
				currentUrl.includes('/dashboard') ||
				currentUrl.includes('/auth/onboarding') ||
				(currentUrl.includes('localhost') && !currentUrl.includes('/auth/'))
			) {
				await this.page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
				const bodyText = await this.page
					.locator('body')
					.textContent()
					.catch(() => '');
				const hasDashboardContent =
					bodyText &&
					(bodyText.includes('Dashboard') ||
						bodyText.includes('Tasks') ||
						bodyText.includes('Wallet') ||
						currentUrl.includes('/dashboard'));
				return hasDashboardContent || !currentUrl.includes('/auth/login');
			}
			return false;
		} catch (error) {
			console.warn('Authentication check error:', error);
			const currentUrl = this.page.url();
			return !currentUrl.includes('/auth/login') && !currentUrl.includes('/auth/register');
		}
	}

	async ensureAuthenticated(method: 'virtual' | 'nostr' | 'bypass' = 'virtual'): Promise<void> {
		const loaded = await this.loadAuthState();
		if (loaded) {
			const isAuth = await this.isAuthenticated();
			if (isAuth) {
				console.log('Using saved authentication state');
				return;
			}
			console.log('Saved auth state expired, re-authenticating...');
		}
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

	async logout(): Promise<void> {
		await this.page.goto('/dashboard');
		const userMenu = this.page
			.locator('.user-menu, .profile-dropdown, [data-testid="user-menu"]')
			.first();
		if (await userMenu.isVisible()) {
			await userMenu.click();
			const logoutButton = this.page
				.locator('button:has-text("Logout"), a:has-text("Logout")')
				.first();
			if (await logoutButton.isVisible()) {
				await logoutButton.click();
				await this.page.waitForURL(/.*\/|\/auth\/login/, { timeout: 5000 });
			}
		}
		if (fs.existsSync(AUTH_STATE_FILE)) {
			fs.unlinkSync(AUTH_STATE_FILE);
		}
	}
}

export function createAuthHelper(page: Page): AuthHelper {
	return new AuthHelper(page);
}

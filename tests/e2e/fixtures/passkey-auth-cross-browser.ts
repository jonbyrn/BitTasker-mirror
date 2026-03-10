import { test as base, expect, chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	readCredentialSet,
	webauthnCredentialsFileExists,
	getCredentialSetLabels
} from '../utils/webauthn-credentials';

export { webauthnCredentialsFileExists, getCredentialSetLabels };

export const CREDENTIALS_MISSING_MESSAGE =
	'WebAuthn credentials file not found. Run 01-signup-onboarding.spec.ts first to generate tests/e2e/.auth/webauthn-credentials.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AUTH_STATE_DIR = join(__dirname, '..', '.auth');

const VIRTUAL_AUTHENTICATOR_OPTIONS = {
	protocol: 'ctap2' as const,
	ctap2Version: 'ctap2_1' as const,
	transport: 'internal' as const,
	hasResidentKey: true,
	hasUserVerification: true,
	isUserVerified: true,
	automaticPresenceSimulation: true
};

type CrossBrowserPasskeyFixtures = {
	credentialLabel: string;
	authenticatedPageCrossBrowser: import('@playwright/test').Page;
};
type CrossBrowserAuthBundle = {
	baseURL: string;
	statePath: string;
	storageEntries: Array<{ name: string; value: string }>;
};

const authStateBuilds = new Map<string, Promise<string>>();
const authBundleCache = new Map<
	string,
	Promise<{ statePath: string; storageEntries: Array<{ name: string; value: string }> }>
>();
type LocalStorageEntry = { name: string; value: string };

function canonicalBaseURL(input: string): string {
	try {
		const url = new URL(input);
		return url.toString().replace(/\/$/, '');
	} catch {
		return input;
	}
}

function safeOriginId(baseURL: string): string {
	try {
		const url = new URL(baseURL);
		return `${url.hostname}-${url.port || (url.protocol === 'https:' ? '443' : '80')}`;
	} catch {
		return baseURL.replace(/[^a-zA-Z0-9]+/g, '-');
	}
}

function authStatePathFor(label: string, baseURL: string): string {
	return join(AUTH_STATE_DIR, `passkey-state-${label}-${safeOriginId(baseURL)}.json`);
}

function formatAvailableCredentialLabels(): string {
	const labels = getCredentialSetLabels();
	return labels.length > 0 ? labels.join(', ') : '(none)';
}

function credentialsForLabelOrThrow(label: string) {
	const requestedLabel = label.trim();
	if (!requestedLabel) {
		throw new Error('Cross-browser auth requires a non-empty credentialLabel.');
	}

	const credentials = readCredentialSet(requestedLabel);
	if (!credentials || credentials.length === 0) {
		throw new Error(
			`${CREDENTIALS_MISSING_MESSAGE} Requested label "${requestedLabel}" has no credentials. Available labels: ${formatAvailableCredentialLabels()}`
		);
	}

	for (const [index, credential] of credentials.entries()) {
		if (
			typeof credential.credentialId !== 'string' ||
			typeof credential.privateKey !== 'string' ||
			typeof credential.rpId !== 'string'
		) {
			throw new Error(
				`Credential artifact is invalid for label "${requestedLabel}" at index ${index}. Required fields: credentialId, privateKey, rpId.`
			);
		}
	}

	return credentials;
}

async function buildAuthStateWithChromium(label: string, baseURL: string): Promise<string> {
	const startedAt = Date.now();
	const credentials = credentialsForLabelOrThrow(label);

	await mkdir(AUTH_STATE_DIR, { recursive: true });
	const statePath = authStatePathFor(label, baseURL);

	const setupBrowser = await chromium.launch();
	const setupContext = await setupBrowser.newContext({
		baseURL,
		storageState: undefined,
		viewport: { width: 1280, height: 720 }
	});
	const setupPage = await setupContext.newPage();
	const cdp = await setupContext.newCDPSession(setupPage);

	try {
		await cdp.send('WebAuthn.enable');
		const result = await cdp.send('WebAuthn.addVirtualAuthenticator', {
			options: VIRTUAL_AUTHENTICATOR_OPTIONS
		});
		const authenticatorId = result?.authenticatorId ?? null;
		if (!authenticatorId) {
			throw new Error('Failed to create virtual authenticator for cross-browser auth state.');
		}

		await cdp.send('WebAuthn.setAutomaticPresenceSimulation', {
			authenticatorId,
			enabled: true
		});

		for (const credential of credentials) {
			await cdp.send('WebAuthn.addCredential', {
				authenticatorId,
				credential
			});
		}

		let authenticated = false;
		let lastError: unknown = null;
		for (let attempt = 0; attempt < 2 && !authenticated; attempt += 1) {
			try {
				await setupPage.goto('/auth/login', { waitUntil: 'load' });
				await setupPage.getByTestId('login-continue-passkey').click();
				await setupPage.waitForURL(/\/dashboard/, { timeout: 10_000 });
				authenticated = true;
			} catch (error) {
				lastError = error;
				if (attempt < 1) continue;
			}
		}
		if (!authenticated) {
			throw lastError instanceof Error
				? lastError
				: new Error('Failed to authenticate while building cross-browser auth state.');
		}

		const understandBtn = setupPage.getByRole('button', {
			name: 'I understand',
			exact: true
		});
		await understandBtn.click({ timeout: 5_000 }).catch(() => {});

		await setupContext.storageState({ path: statePath });
		console.log(
			`[E2E][cross-browser-auth] built state for ${label} (${baseURL}) in ${Date.now() - startedAt}ms`
		);
		return statePath;
	} finally {
		await setupContext.close().catch(() => {});
		await setupBrowser.close().catch(() => {});
	}
}

function ensureAuthState(label: string, baseURL: string): Promise<string> {
	const statePath = authStatePathFor(label, baseURL);
	if (existsSync(statePath)) {
		return Promise.resolve(statePath);
	}

	const cacheKey = `${label}|${baseURL}`;
	const cached = authStateBuilds.get(cacheKey);
	if (cached) return cached;

	const buildPromise = (async () => {
		await mkdir(AUTH_STATE_DIR, { recursive: true });
		return buildAuthStateWithChromium(label, baseURL);
	})().catch((error) => {
		authStateBuilds.delete(cacheKey);
		throw error;
	});
	authStateBuilds.set(cacheKey, buildPromise);
	return buildPromise;
}

async function loadStateLocalStorageEntries(
	statePath: string,
	baseURL: string
): Promise<LocalStorageEntry[]> {
	let rawState = '';
	try {
		rawState = await readFile(statePath, 'utf-8');
	} catch (error) {
		throw new Error(
			`Cross-browser auth state file is missing or unreadable at ${statePath}: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}

	let parsed: {
		origins?: Array<{ origin: string; localStorage?: Array<{ name: unknown; value: unknown }> }>;
	};
	try {
		parsed = JSON.parse(rawState) as typeof parsed;
	} catch (error) {
		throw new Error(
			`Cross-browser auth state file is not valid JSON at ${statePath}: ${
				error instanceof Error ? error.message : String(error)
			}`
		);
	}

	if (!Array.isArray(parsed.origins)) {
		throw new Error(
			`Cross-browser auth state file at ${statePath} is invalid: missing origins array.`
		);
	}

	const origin = parsed.origins.find((entry) => entry.origin === baseURL);
	if (!origin) {
		throw new Error(
			`Cross-browser auth state at ${statePath} does not contain origin ${baseURL}. Delete this file and rerun to rebuild deterministic auth state.`
		);
	}
	if (!Array.isArray(origin.localStorage)) {
		throw new Error(
			`Cross-browser auth state at ${statePath} is invalid for origin ${baseURL}: missing localStorage array.`
		);
	}

	for (const [index, entry] of origin.localStorage.entries()) {
		if (typeof entry?.name !== 'string' || typeof entry?.value !== 'string') {
			throw new Error(
				`Cross-browser auth state at ${statePath} has invalid localStorage entry at index ${index} for origin ${baseURL}.`
			);
		}
	}

	return origin.localStorage as LocalStorageEntry[];
}

async function ensureAuthBundle(
	label: string,
	baseURL: string
): Promise<{
	statePath: string;
	storageEntries: Array<{ name: string; value: string }>;
}> {
	const cacheKey = `${label}|${baseURL}`;
	const existing = authBundleCache.get(cacheKey);
	if (existing) return existing;

	const bundlePromise = (async () => {
		const statePath = await ensureAuthState(label, baseURL);
		const storageEntries = await loadStateLocalStorageEntries(statePath, baseURL);
		return { statePath, storageEntries };
	})().catch((error) => {
		authBundleCache.delete(cacheKey);
		throw error;
	});
	authBundleCache.set(cacheKey, bundlePromise);
	return bundlePromise;
}

const test = base.extend<
	CrossBrowserPasskeyFixtures & { crossBrowserAuthBundle: CrossBrowserAuthBundle }
>({
	credentialLabel: ['signup', { option: true }],

	crossBrowserAuthBundle: [
		async ({ credentialLabel }, use, testInfo) => {
			const projectBaseURL = testInfo.project.use.baseURL ?? 'http://localhost:4173';
			const baseURL = canonicalBaseURL(projectBaseURL);
			const { statePath, storageEntries } = await ensureAuthBundle(credentialLabel, baseURL);
			const accessToken = storageEntries.find(
				(entry) => entry.name === 'CapacitorStorage.access_token'
			)?.value;
			if (!accessToken) {
				throw new Error(
					`Cross-browser auth state at ${statePath} is missing CapacitorStorage.access_token for origin ${baseURL}.`
				);
			}
			await use({ baseURL, statePath, storageEntries });
		},
		{ timeout: 90_000 }
	],

	authenticatedPageCrossBrowser: async ({ browser, crossBrowserAuthBundle }, use, testInfo) => {
		testInfo.setTimeout(Math.max(testInfo.timeout, 60_000));
		const setupStart = Date.now();
		const { baseURL, statePath, storageEntries } = crossBrowserAuthBundle;

		const context = await browser.newContext({
			baseURL,
			storageState: statePath,
			viewport: testInfo.project.use.viewport ?? { width: 1280, height: 720 },
			userAgent: testInfo.project.use.userAgent
		});
		await context.addInitScript((entries) => {
			try {
				for (const entry of entries) {
					window.localStorage.setItem(entry.name, entry.value);
				}
			} catch {
				// Ignore storage injection errors; auth checks below will fail deterministically.
			}
		}, storageEntries);

		const page = await context.newPage();

		try {
			try {
				await page.goto('/dashboard', { waitUntil: 'load' });
			} catch (error) {
				throw new Error(
					`Cross-browser auth bootstrap could not open ${baseURL}/dashboard in ${testInfo.project.name}: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}

			const reachedDashboard = await expect
				.poll(() => page.url(), { timeout: 10_000 })
				.toMatch(/\/dashboard/)
				.then(() => true)
				.catch(() => false);
			if (!reachedDashboard) {
				throw new Error(
					`Cross-browser auth bootstrap did not reach /dashboard in ${testInfo.project.name}. Current URL: ${page.url()}`
				);
			}

			const loginVisible = await page
				.getByTestId('login-link')
				.first()
				.isVisible()
				.catch(() => false);
			if (loginVisible) {
				throw new Error(
					`Cross-browser auth bootstrap landed on authenticated route but login UI is still visible in ${testInfo.project.name}.`
				);
			}

			const understandBtn = page.getByRole('button', {
				name: 'I understand',
				exact: true
			});
			await understandBtn.click({ timeout: 5_000 }).catch(() => {});
			console.log(
				`[E2E][cross-browser-auth] prepared page for ${testInfo.title} (${baseURL}) in ${Date.now() - setupStart}ms`
			);

			await use(page);
		} finally {
			await context.close();
		}
	}
});

export { test, expect };

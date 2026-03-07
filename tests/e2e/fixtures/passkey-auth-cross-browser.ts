import { test as base, expect, chromium } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	readCredentialSet,
	readFirstCredentialSet,
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

async function buildAuthStateWithChromium(label: string, baseURL: string): Promise<string> {
	const credentials = readCredentialSet(label) ?? readFirstCredentialSet();
	if (!credentials || credentials.length === 0) {
		throw new Error(`${CREDENTIALS_MISSING_MESSAGE} (label: ${label})`);
	}

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
				await setupPage.waitForURL(/\/dashboard/, { timeout: 20_000 });
				authenticated = true;
			} catch (error) {
				lastError = error;
				if (attempt < 1) {
					await setupPage.waitForTimeout(1_000);
				}
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
		const remapped = await tryRemapExistingAuthState(label, baseURL, statePath);
		if (remapped) return statePath;
		return buildAuthStateWithChromium(label, baseURL);
	})().catch((error) => {
		authStateBuilds.delete(cacheKey);
		throw error;
	});
	authStateBuilds.set(cacheKey, buildPromise);
	return buildPromise;
}

async function tryRemapExistingAuthState(
	label: string,
	baseURL: string,
	targetPath: string
): Promise<boolean> {
	try {
		const files = await readdir(AUTH_STATE_DIR);
		const candidates = files
			.filter((name) => name.startsWith(`passkey-state-${label}`) && name.endsWith('.json'))
			.map((name) => join(AUTH_STATE_DIR, name))
			.filter((path) => path !== targetPath);

		for (const candidate of candidates) {
			const raw = await readFile(candidate, 'utf-8');
			const parsed = JSON.parse(raw) as {
				cookies?: unknown[];
				origins?: Array<{ origin: string; localStorage?: Array<{ name: string; value: string }> }>;
			};
			const sourceEntries =
				parsed.origins?.find((origin) =>
					(origin.localStorage ?? []).some(
						(item) => item.name === 'CapacitorStorage.access_token' && !!item.value
					)
				)?.localStorage ?? [];
			if (sourceEntries.length === 0) continue;

			const remapped = {
				cookies: parsed.cookies ?? [],
				origins: [{ origin: baseURL, localStorage: sourceEntries }]
			};
			await writeFile(targetPath, JSON.stringify(remapped, null, 2), 'utf-8');
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

async function loadStateLocalStorageEntries(statePath: string, baseURL: string): Promise<Array<{ name: string; value: string }>> {
	try {
		const raw = await readFile(statePath, 'utf-8');
		const parsed = JSON.parse(raw) as {
			origins?: Array<{ origin: string; localStorage?: Array<{ name: string; value: string }> }>;
		};
		const origin = parsed.origins?.find((entry) => entry.origin === baseURL);
		return origin?.localStorage ?? [];
	} catch {
		return [];
	}
}

async function authEntryValue(
	statePath: string,
	baseURL: string,
	key: string
): Promise<string | null> {
	const entries = await loadStateLocalStorageEntries(statePath, baseURL);
	const found = entries.find((entry) => entry.name === key);
	return found?.value ?? null;
}

const test = base.extend<CrossBrowserPasskeyFixtures & { crossBrowserAuthBundle: CrossBrowserAuthBundle }>({
	credentialLabel: ['signup', { option: true, scope: 'worker' }],

	crossBrowserAuthBundle: [
		async ({ credentialLabel }, use, workerInfo) => {
			const baseURL = workerInfo.project.use.baseURL ?? 'http://localhost:4173';
			const statePath = await ensureAuthState(credentialLabel, baseURL);
			const storageEntries = await loadStateLocalStorageEntries(statePath, baseURL);
			const accessToken = await authEntryValue(
				statePath,
				baseURL,
				'CapacitorStorage.access_token'
			);
			if (!accessToken) {
				throw new Error(
					`Cross-browser auth state is missing CapacitorStorage.access_token for ${baseURL}.`
				);
			}
			await use({ baseURL, statePath, storageEntries });
		},
		{ scope: 'worker', timeout: 180_000 }
	],

	authenticatedPageCrossBrowser: async ({ browser, crossBrowserAuthBundle }, use, testInfo) => {
		testInfo.setTimeout(Math.max(testInfo.timeout, 120_000));
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
			await page.goto('/dashboard', { waitUntil: 'load' });
			await expect
				.poll(() => page.url(), { timeout: 20_000 })
				.toMatch(/\/dashboard/);
			await expect(page.getByTestId('login-link')).toHaveCount(0, { timeout: 10_000 });

			const understandBtn = page.getByRole('button', {
				name: 'I understand',
				exact: true
			});
			await understandBtn.click({ timeout: 5_000 }).catch(() => {});

			await use(page);
		} finally {
			await context.close();
		}
	}
});

export { test, expect };

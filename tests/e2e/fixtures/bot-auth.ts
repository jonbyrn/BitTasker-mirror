import { expect, type Page } from '@playwright/test';
import { generateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export interface BotIdentity {
	nsec: string;
	npub: string;
	mnemonic: string;
	appRegistered?: boolean;
}

export type StaticBotName = 'treasury' | 'client' | 'freelancer';

const AUTH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.auth');
const STATIC_BOTS_FILE = path.join(AUTH_DIR, 'static-bots.json');
const POST_LOGIN_URL = /\/(?:wallet|create-task)(?:[/?#]|$)/;

function npubFromNsec(nsec: string): string {
	const decoded = nip19.decode(nsec);
	if (decoded.type !== 'nsec') {
		throw new Error(`Expected nsec, got ${decoded.type}`);
	}
	return nip19.npubEncode(getPublicKey(decoded.data));
}

function identityFromEnv(botName: StaticBotName): BotIdentity | null {
	if (botName === 'client' && process.env.E2E_CLIENT_NSEC) {
		return {
			nsec: process.env.E2E_CLIENT_NSEC,
			npub: npubFromNsec(process.env.E2E_CLIENT_NSEC),
			mnemonic: process.env.E2E_CLIENT_MNEMONIC ?? '',
			appRegistered: true
		};
	}
	if (botName === 'freelancer' && process.env.E2E_FREELANCER_NSEC) {
		return {
			nsec: process.env.E2E_FREELANCER_NSEC,
			npub: npubFromNsec(process.env.E2E_FREELANCER_NSEC),
			mnemonic: process.env.E2E_FREELANCER_MNEMONIC ?? '',
			appRegistered: true
		};
	}
	return null;
}

function persistE2eAuth({
	nsec,
	npub,
	mnemonic
}: {
	nsec: string;
	npub: string;
	mnemonic: string;
}) {
	const persist = (key: string, value: string) => {
		window.localStorage.setItem(key, value);
		window.localStorage.setItem(`CapacitorStorage.${key}`, value);
	};
	persist('__PLAYWRIGHT_TEST__', 'true');
	persist('__E2E_NSEC__', nsec);
	persist('__E2E_NPUB__', npub);
	persist('__E2E_MNEMONIC__', mnemonic);
	persist('onboardingCompleted', 'true');
	window.__PLAYWRIGHT_TEST__ = true;
}

function persistAuthSession({
	accessToken,
	refreshToken,
	npub
}: {
	accessToken: string;
	refreshToken?: string;
	npub: string;
}) {
	const persist = (key: string, value: string) => {
		window.localStorage.setItem(key, value);
		window.localStorage.setItem(`CapacitorStorage.${key}`, value);
	};
	persist('access_token', accessToken);
	if (refreshToken) persist('refresh_token', refreshToken);
	persist('npub', npub);
	persist('auth_method', 'nsec');
	persist('onboardingCompleted', 'true');
	window.__PLAYWRIGHT_TEST__ = true;
}

function readStoredToken(): string | null {
	return (
		window.localStorage.getItem('CapacitorStorage.access_token') ||
		window.localStorage.getItem('access_token')
	);
}

function parseLoginTokens(body: unknown): { accessToken: string; refreshToken?: string } | null {
	if (!body || typeof body !== 'object') return null;
	const record = body as Record<string, unknown>;
	const accessToken = record.access_token;
	if (typeof accessToken !== 'string' || accessToken.length === 0) return null;
	return {
		accessToken,
		refreshToken: typeof record.refresh_token === 'string' ? record.refresh_token : undefined
	};
}

type StaticBotIdentities = Record<StaticBotName, BotIdentity>;

function readStaticBotIdentities(): Partial<StaticBotIdentities> {
	if (!existsSync(STATIC_BOTS_FILE)) return {};
	return JSON.parse(readFileSync(STATIC_BOTS_FILE, 'utf8')) as Partial<StaticBotIdentities>;
}

function saveStaticBotIdentities(identities: Partial<StaticBotIdentities>): void {
	mkdirSync(AUTH_DIR, { recursive: true });
	writeFileSync(STATIC_BOTS_FILE, `${JSON.stringify(identities, null, 2)}\n`, { mode: 0o600 });
}

export function generateBotIdentity(): BotIdentity {
	const secretKey = generateSecretKey();
	const publicKey = getPublicKey(secretKey);

	return {
		nsec: nip19.nsecEncode(secretKey),
		npub: nip19.npubEncode(publicKey),
		mnemonic: generateMnemonic(wordlist, 128)
	};
}

function createStaticBotIdentity(): BotIdentity {
	const secretKey = generateSecretKey();
	return {
		nsec: nip19.nsecEncode(secretKey),
		npub: nip19.npubEncode(getPublicKey(secretKey)),
		mnemonic: generateMnemonic(wordlist, 128)
	};
}

export function getStaticBotIdentities(): StaticBotIdentities {
	const stored = readStaticBotIdentities();
	if (stored.treasury && stored.client && stored.freelancer) {
		return stored as StaticBotIdentities;
	}

	const identities: StaticBotIdentities = {
		treasury: stored.treasury ?? createStaticBotIdentity(),
		client: stored.client ?? createStaticBotIdentity(),
		freelancer: stored.freelancer ?? createStaticBotIdentity()
	};
	saveStaticBotIdentities(identities);
	return identities;
}

export async function signUpBot(
	page: Page,
	botName: StaticBotName,
	baseUrl = process.env.PW_E2E_BASE_URL || 'http://localhost:3000',
	forceSignup = false
): Promise<BotIdentity> {
	const stored = readStaticBotIdentities();
	const envIdentity = identityFromEnv(botName);
	if (!forceSignup && (envIdentity || stored[botName]?.appRegistered)) {
		const identity = envIdentity ?? stored[botName];
		if (!identity) {
			throw new Error(`Missing ${botName} bot identity for login.`);
		}
		await loginWithNsec(page, identity.nsec, identity.npub, identity.mnemonic, baseUrl);
		saveStaticBotIdentities({ ...stored, [botName]: { ...identity, appRegistered: true } });
		return { ...identity, appRegistered: true };
	}

	await page.addInitScript(() => {
		window.localStorage.setItem('__PLAYWRIGHT_TEST__', 'true');
		window.localStorage.setItem('CapacitorStorage.__PLAYWRIGHT_TEST__', 'true');
		window.localStorage.setItem('onboardingCompleted', 'true');
		window.localStorage.setItem('CapacitorStorage.onboardingCompleted', 'true');
		window.__PLAYWRIGHT_TEST__ = true;
	});
	await page.goto(new URL('/auth/signup', baseUrl).toString());
	await page.locator('[data-testid="signup-tos-checkbox"]').check();
	await page.locator('[data-testid="signup-continue"]').click();
	try {
		await page.locator('[data-testid="onboarding-display-name-input"]').fill(`E2E ${botName}`);
	} catch (error) {
		const visibleText = (await page.locator('body').innerText()).slice(0, 1200);
		throw new Error(
			`Signup did not reach the display-name step. Current URL: ${page.url()}\n${visibleText}`,
			{ cause: error }
		);
	}
	await page.locator('[data-testid="onboarding-display-name-next"]').click();

	const identity = await page.evaluate(() => ({
		nsec: localStorage.getItem('__E2E_NSEC__'),
		npub: localStorage.getItem('__E2E_NPUB__'),
		mnemonic: localStorage.getItem('__E2E_MNEMONIC__')
	}));
	if (!identity.nsec || !identity.npub || !identity.mnemonic) {
		throw new Error('Application signup did not expose the generated E2E identity.');
	}

	const botIdentity: BotIdentity = { ...identity, appRegistered: true } as BotIdentity;
	await page.locator('[data-testid="passkey-setup-button"]').click();
	await page.goto(new URL('/wallet', baseUrl).toString());
	await expect(page).toHaveURL(/\/wallet(?:[/?#]|$)/);
	const identities = { ...stored, [botName]: botIdentity } as Partial<StaticBotIdentities>;
	saveStaticBotIdentities(identities);
	return botIdentity;
}

export async function loginWithNsec(
	page: Page,
	nsec: string,
	npub: string,
	mnemonic: string,
	baseUrl?: string
): Promise<void> {
	const loginResponses: Array<{ status: number; url: string; body: string }> = [];
	page.on('response', async (response) => {
		if (!response.url().includes('/api/v1/auth/login/nostr')) return;
		let body = '';
		try {
			body = (await response.text()).slice(0, 1000);
		} catch {
			body = '<unavailable>';
		}
		loginResponses.push({ status: response.status(), url: response.url(), body });
		console.error(`[E2E auth] ${response.status()} ${response.url()} ${body}`);
	});
	await page.addInitScript(persistE2eAuth, { nsec, npub, mnemonic });

	const loginUrl = baseUrl ? new URL('/auth/login', baseUrl).toString() : '/auth/login';
	const createTaskUrl = baseUrl ? new URL('/create-task', baseUrl).toString() : '/create-task';

	await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
	await expect(page.locator('[data-testid="login-with-nsec"]')).toBeVisible({ timeout: 30_000 });
	await page.locator('[data-testid="login-with-nsec"]').click();
	await page.locator('[data-testid="login-nsec-input"]').fill(nsec);

	const [loginResponse] = await Promise.all([
		page.waitForResponse(
			(response) => response.url().includes('/api/v1/auth/login/nostr') && response.status() < 500,
			{ timeout: 30_000 }
		),
		page.locator('[data-testid="login-submit"]').click()
	]);

	const loginJson = await loginResponse.json().catch(() => null);
	const tokens =
		parseLoginTokens(loginJson) ??
		parseLoginTokens(
			(() => {
				try {
					return JSON.parse(loginResponses.at(-1)?.body ?? '');
				} catch {
					return null;
				}
			})()
		);
	if (tokens) {
		await page.evaluate(persistAuthSession, { ...tokens, npub });
	}

	await expect.poll(async () => page.evaluate(readStoredToken), { timeout: 15_000 }).toBeTruthy();
	await page.context().cookies();

	try {
		await page.waitForURL(POST_LOGIN_URL, { timeout: 30_000 });
	} catch (error) {
		if (await page.evaluate(readStoredToken)) {
			await page.goto(createTaskUrl, { waitUntil: 'domcontentloaded' });
		}
		if (page.isClosed() || !POST_LOGIN_URL.test(new URL(page.url()).pathname)) {
			const currentUrl = page.isClosed() ? '<page closed>' : page.url();
			const visibleText = page.isClosed()
				? '<page closed before diagnostic capture>'
				: (
						await page
							.locator('body')
							.innerText()
							.catch(() => '<body unavailable>')
					).slice(0, 1000);
			throw new Error(
				`Nsec login did not reach /wallet or /create-task. Current URL: ${currentUrl}\n${JSON.stringify(loginResponses)}\n${visibleText}`,
				{ cause: error }
			);
		}
	}

	if (
		!page.isClosed() &&
		page.url().includes('/auth/login') &&
		(await page.evaluate(readStoredToken))
	) {
		await page.goto(createTaskUrl, { waitUntil: 'domcontentloaded' });
	}

	await expect(page).toHaveURL(POST_LOGIN_URL, { timeout: 30_000 });
	await expect.poll(async () => page.evaluate(readStoredToken), { timeout: 10_000 }).toBeTruthy();
}

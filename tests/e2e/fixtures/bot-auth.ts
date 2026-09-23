import { expect, type Page, type Response } from '@playwright/test';
import { generateMnemonic, validateMnemonic } from '@scure/bip39';
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

const NEST_BASE_URL = (process.env.VITE_API_URL || 'http://127.0.0.1:8000')
	.replace(/\/$/, '')
	.replace('://localhost:8000', '://127.0.0.1:8000');

export async function waitForNestReady(page: Page): Promise<void> {
	await expect(async () => {
		const response = await page.request.get(`${NEST_BASE_URL}/api/health-check`);
		if (response.status() !== 200) {
			throw new Error(`Nest health ${response.status()} at ${NEST_BASE_URL}`);
		}
	}).toPass({ timeout: 90_000, intervals: [500, 1_000, 2_000] });
}

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

const INVALID_LETTER_ADVICE =
	'letter advice cage absurd amount doctor platform sentence erase drop breeze stuff';
const VALID_LETTER_ADVICE =
	'letter advice cage absurd amount doctor acoustic avoid letter advice cage above';

const PLACEHOLDER_MNEMONICS = new Set([
	'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
	INVALID_LETTER_ADVICE,
	VALID_LETTER_ADVICE
]);

function normalizeMnemonic(mnemonic: string): string {
	return mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
}

function repairBotMnemonic(identity: BotIdentity): BotIdentity {
	const mnemonic = normalizeMnemonic(identity.mnemonic);
	if (identity.mnemonic.trim().startsWith('nsec') || mnemonic.startsWith('nsec')) {
		return { ...identity, mnemonic: generateMnemonic(wordlist, 128) };
	}
	if (mnemonic === INVALID_LETTER_ADVICE) {
		return { ...identity, mnemonic: VALID_LETTER_ADVICE };
	}
	if (validateMnemonic(mnemonic, wordlist)) {
		return mnemonic === identity.mnemonic ? identity : { ...identity, mnemonic };
	}
	return { ...identity, mnemonic: generateMnemonic(wordlist, 128) };
}

export function hasHdMnemonic(mnemonic: string | undefined): mnemonic is string {
	return typeof mnemonic === 'string' && mnemonic.trim().split(/\s+/).filter(Boolean).length >= 12;
}

export function isLiveKeychain(mnemonic: string | undefined): mnemonic is string {
	if (!hasHdMnemonic(mnemonic)) return false;
	return !PLACEHOLDER_MNEMONICS.has(normalizeMnemonic(mnemonic));
}

function identityFromEnv(botName: StaticBotName): BotIdentity | null {
	if (botName === 'treasury' && process.env.E2E_TREASURY_NSEC) {
		if (!isLiveKeychain(process.env.E2E_TREASURY_MNEMONIC)) return null;
		return {
			nsec: process.env.E2E_TREASURY_NSEC,
			npub: npubFromNsec(process.env.E2E_TREASURY_NSEC),
			mnemonic: process.env.E2E_TREASURY_MNEMONIC,
			appRegistered: true
		};
	}
	if (botName === 'client' && process.env.E2E_CLIENT_NSEC) {
		if (!isLiveKeychain(process.env.E2E_CLIENT_MNEMONIC)) return null;
		return {
			nsec: process.env.E2E_CLIENT_NSEC,
			npub: npubFromNsec(process.env.E2E_CLIENT_NSEC),
			mnemonic: process.env.E2E_CLIENT_MNEMONIC,
			appRegistered: true
		};
	}
	if (botName === 'freelancer' && process.env.E2E_FREELANCER_NSEC) {
		if (!isLiveKeychain(process.env.E2E_FREELANCER_MNEMONIC)) return null;
		return {
			nsec: process.env.E2E_FREELANCER_NSEC,
			npub: npubFromNsec(process.env.E2E_FREELANCER_NSEC),
			mnemonic: process.env.E2E_FREELANCER_MNEMONIC,
			appRegistered: true
		};
	}
	return null;
}

export type BotKeychainReport = {
	bot: StaticBotName;
	npubPrefix: string;
	mnemonicWords: number;
	live: boolean;
	appRegistered: boolean;
	source: 'env' | 'static-bots' | 'missing';
	wordCount?: number;
	word6Len?: number;
	word6Lower?: boolean;
	hasNsecPrefix?: boolean;
};

export function inspectBotKeychains(): BotKeychainReport[] {
	const stored = getStaticBotIdentities();
	return (['treasury', 'client', 'freelancer'] as const).map((bot) => {
		const envIdentity = identityFromEnv(bot);
		const identity = envIdentity ?? stored[bot];
		return {
			bot,
			npubPrefix: identity?.npub?.slice(0, 12) ?? '',
			mnemonicWords: identity?.mnemonic?.trim().split(/\s+/).filter(Boolean).length ?? 0,
			live: isLiveKeychain(identity?.mnemonic),
			appRegistered: identity?.appRegistered === true,
			source: envIdentity ? 'env' : stored[bot] ? 'static-bots' : 'missing',
			...(identity?.mnemonic ? seedShape(identity.mnemonic) : {})
		};
	});
}

function seedShape(mnemonic: string) {
	const words = mnemonic.trim().split(/\s+/);
	return {
		wordCount: words.length,
		word6Len: words[5]?.length ?? 0,
		word6Lower: words[5]?.toLowerCase() === words[5],
		hasNsecPrefix: mnemonic.trim().startsWith('nsec')
	};
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
	if (mnemonic.trim().startsWith('nsec')) {
		throw new Error('Invalid mnemonic: E2E seed is an nsec');
	}
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
	const identities: StaticBotIdentities = {
		treasury: stored.treasury ?? createStaticBotIdentity(),
		client: stored.client ?? createStaticBotIdentity(),
		freelancer: stored.freelancer ?? createStaticBotIdentity()
	};
	const repaired: StaticBotIdentities = {
		treasury: repairBotMnemonic(identities.treasury),
		client: repairBotMnemonic(identities.client),
		freelancer: repairBotMnemonic(identities.freelancer)
	};
	if (
		!stored.treasury ||
		!stored.client ||
		!stored.freelancer ||
		repaired.treasury.mnemonic !== identities.treasury.mnemonic ||
		repaired.client.mnemonic !== identities.client.mnemonic ||
		repaired.freelancer.mnemonic !== identities.freelancer.mnemonic
	) {
		saveStaticBotIdentities(repaired);
	}
	return repaired;
}

export async function signUpBot(
	page: Page,
	botName: StaticBotName,
	baseUrl = process.env.PW_E2E_BASE_URL || 'http://localhost:3000',
	forceSignup = false
): Promise<BotIdentity> {
	const stored = getStaticBotIdentities();
	const envIdentity = identityFromEnv(botName);
	if (!forceSignup && (envIdentity || stored[botName]?.appRegistered)) {
		const identity = envIdentity ?? stored[botName];
		if (!identity) {
			throw new Error(`Missing ${botName} bot identity for login.`);
		}
		if (!hasHdMnemonic(identity.mnemonic)) {
			throw new Error(`${botName} keychain is missing a 12-word mnemonic.`);
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
	await waitForNestReady(page);

	const loginUrl = baseUrl ? new URL('/auth/login', baseUrl).toString() : '/auth/login';
	const createTaskUrl = baseUrl ? new URL('/create-task', baseUrl).toString() : '/create-task';

	await expect(async () => {
		const response = await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
		if (!response || response.status() >= 500) {
			throw new Error(`login page not ready: ${response?.status() ?? 'no response'}`);
		}
		await expect(page.locator('[data-testid="login-with-nsec"]')).toBeVisible({ timeout: 15_000 });
	}).toPass({ timeout: 90_000 });
	await page.locator('[data-testid="login-with-nsec"]').click();
	await page.locator('[data-testid="login-nsec-input"]').fill(nsec);

	let loginResponse: Response | null = null;
	await expect(async () => {
		const pending = page.waitForResponse(
			(response) => response.url().includes('/api/v1/auth/login/nostr') && response.status() < 500,
			{ timeout: 20_000 }
		);
		await page.locator('[data-testid="login-submit"]').click();
		loginResponse = await pending;
	}).toPass({ timeout: 90_000 });
	if (!loginResponse) {
		throw new Error('Nostr login did not return a response from Nest');
	}

	const loginJson: unknown = await loginResponse.json().catch(() => null);
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
			await expect(async () => {
				const res = await page.goto(createTaskUrl, { waitUntil: 'domcontentloaded' });
				if (!res || res.status() >= 500) throw new Error('create-task not ready');
			}).toPass({ timeout: 60_000 });
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
		await expect(async () => {
			const res = await page.goto(createTaskUrl, { waitUntil: 'domcontentloaded' });
			if (!res || res.status() >= 500) throw new Error('create-task not ready');
		}).toPass({ timeout: 60_000 });
	}

	await expect(page).toHaveURL(POST_LOGIN_URL, { timeout: 30_000 });
	await expect.poll(async () => page.evaluate(readStoredToken), { timeout: 10_000 }).toBeTruthy();
}

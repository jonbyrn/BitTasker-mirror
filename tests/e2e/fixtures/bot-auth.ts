import { expect, type Page } from '@playwright/test';
import { generateMnemonic } from 'bip39';
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
		mnemonic: generateMnemonic(128)
	};
}

function createStaticBotIdentity(): BotIdentity {
	const secretKey = generateSecretKey();
	return {
		nsec: nip19.nsecEncode(secretKey),
		npub: nip19.npubEncode(getPublicKey(secretKey)),
		mnemonic: generateMnemonic(128)
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
	if (!forceSignup && stored[botName]?.appRegistered) {
		const identity = stored[botName];
		await loginWithNsec(page, identity.nsec, identity.npub, identity.mnemonic, baseUrl);
		return identity;
	}

	await page.addInitScript(() => {
		window.localStorage.setItem('__PLAYWRIGHT_TEST__', 'true');
		Object.defineProperty(window, '__PLAYWRIGHT_TEST__', { value: true, configurable: true });
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
	await page.addInitScript(
		({ nsec: initNsec, npub: initNpub, mnemonic: initMnemonic }) => {
			window.localStorage.setItem('__PLAYWRIGHT_TEST__', 'true');
			window.localStorage.setItem('__E2E_NSEC__', initNsec);
			window.localStorage.setItem('__E2E_NPUB__', initNpub);
			window.localStorage.setItem('__E2E_MNEMONIC__', initMnemonic);
			Object.defineProperty(window, '__PLAYWRIGHT_TEST__', {
				value: true,
				configurable: true
			});
		},
		{ nsec, npub, mnemonic }
	);

	await page.goto(baseUrl ? new URL('/auth/login', baseUrl).toString() : '/auth/login');
	await page.waitForLoadState('domcontentloaded');
	await page.locator('[data-testid="login-with-nsec"]').click();
	await page.locator('[data-testid="login-nsec-input"]').fill(nsec);
	await page.locator('[data-testid="login-submit"]').click();
	await page
		.waitForResponse(
			(response) =>
				response.url().includes('/api/v1/auth/login/nostr') && response.status() < 500,
			{ timeout: 15_000 }
		)
		.catch(() => undefined);
	try {
		await page.waitForURL('**/wallet**', { waitUntil: 'domcontentloaded', timeout: 30_000 });
	} catch (error) {
		const currentUrl = page.isClosed() ? '<page closed>' : page.url();
		const visibleText = page.isClosed()
			? '<page closed before diagnostic capture>'
			: (await page.locator('body').innerText().catch(() => '<body unavailable>')).slice(0, 1000);
		throw new Error(
			`Nsec login did not redirect to /wallet. Current URL: ${currentUrl}\n${JSON.stringify(loginResponses)}\n${visibleText}`,
			{ cause: error }
		);
	}
	await expect(page).toHaveURL(/\/wallet(?:[/?#]|$)/);
}

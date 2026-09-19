import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { getStaticBotIdentities, signUpBot, type BotIdentity } from './bot-auth';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AUTH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.auth');
const SUB_BOT_ADDRESSES_FILE = path.join(AUTH_DIR, 'sub-bot-addresses.json');
const TESTNET_NETWORK = 'testnet';
const TESTNET_CONFIRM_MS = 300_000;
const WALLET_CONNECT_MS = 10_000;
const E2E_BASE_URL = process.env.PW_E2E_BASE_URL || 'http://localhost:3000';

type TreasuryWalletWindow = Window & {
	__btcAddress?: string;
	__btcBalanceSats?: number;
	__btcUtxoCount?: number;
	__btcWalletSynced?: boolean;
	__connectWallet?: () => Promise<void>;
	__refreshBtcBalance?: () => Promise<void>;
	__sendBtc?: (params: {
		address: string;
		amountSats: number;
		feeRate?: number;
	}) => Promise<string>;
};

function ensureAuthDirectory(): void {
	mkdirSync(AUTH_DIR, { recursive: true });
}

export function getTreasuryIdentity(): BotIdentity {
	return getStaticBotIdentities().treasury;
}

export function registerSubBotAddress(targetNpub: string, address: string): void {
	if (!targetNpub.startsWith('npub1')) throw new Error('targetNpub must be a Bech32 npub');
	if (!/^tb1[a-z0-9]+$/.test(address))
		throw new Error('Sub-bot address must be a testnet tb1 address');

	ensureAuthDirectory();
	const addresses = existsSync(SUB_BOT_ADDRESSES_FILE)
		? (JSON.parse(readFileSync(SUB_BOT_ADDRESSES_FILE, 'utf8')) as Record<string, string>)
		: {};
	addresses[targetNpub] = address;
	writeFileSync(SUB_BOT_ADDRESSES_FILE, `${JSON.stringify(addresses, null, 2)}\n`, { mode: 0o600 });
}

function getRegisteredSubBotAddress(targetNpub: string): string {
	if (!existsSync(SUB_BOT_ADDRESSES_FILE)) {
		throw new Error(
			`No sub-bot address registry found. Register ${targetNpub} with registerSubBotAddress() first.`
		);
	}

	const addresses = JSON.parse(readFileSync(SUB_BOT_ADDRESSES_FILE, 'utf8')) as Record<
		string,
		string
	>;
	const address = addresses[targetNpub];
	if (!address) {
		throw new Error(`No testnet address registered for ${targetNpub}.`);
	}
	return address;
}

async function waitForTreasuryWallet(page: Page): Promise<void> {
	await page.waitForTimeout(WALLET_CONNECT_MS);
	await page.evaluate(async () => {
		const probe = window as TreasuryWalletWindow;
		if (probe.__btcWalletSynced) return;
		if (typeof probe.__connectWallet === 'function') {
			await probe.__connectWallet();
		}
	});
	await expect
		.poll(
			async () =>
				page.evaluate(
					() =>
						Boolean((window as TreasuryWalletWindow).__btcAddress) &&
						(window as TreasuryWalletWindow).__btcWalletSynced === true
				),
			{ timeout: TESTNET_CONFIRM_MS, intervals: [10_000] }
		)
		.toBe(true);
	await expect(page.locator('[data-testid="wallet-connected"]')).toBeVisible({
		timeout: TESTNET_CONFIRM_MS
	});
}

async function refreshTreasurySnapshot(page: Page): Promise<{
	address: string;
	balance: number;
	utxoCount: number;
	synced: boolean;
}> {
	await page.evaluate(async () => {
		const refresh = (window as TreasuryWalletWindow).__refreshBtcBalance;
		if (refresh) await refresh();
	});
	return page.evaluate(() => ({
		address: (window as TreasuryWalletWindow).__btcAddress ?? '',
		balance: (window as TreasuryWalletWindow).__btcBalanceSats ?? 0,
		utxoCount: (window as TreasuryWalletWindow).__btcUtxoCount ?? 0,
		synced: (window as TreasuryWalletWindow).__btcWalletSynced === true
	}));
}

async function sendFromTreasuryPage(
	page: Page,
	address: string,
	amountSats: number
): Promise<string> {
	await page.goto(new URL('/wallet', E2E_BASE_URL).toString(), { waitUntil: 'domcontentloaded' });
	await waitForTreasuryWallet(page);
	let snapshot = await refreshTreasurySnapshot(page);
	try {
		await expect
			.poll(
				async () => {
					snapshot = await refreshTreasurySnapshot(page);
					return snapshot.balance;
				},
				{ timeout: TESTNET_CONFIRM_MS, intervals: [5_000, 10_000] }
			)
			.toBeGreaterThanOrEqual(amountSats);
	} catch {
		throw new Error(
			`Treasury spendable ${snapshot.balance} sats after keychain scan (${snapshot.utxoCount} utxos, synced=${snapshot.synced}) is below requested ${amountSats} sats. Current receive ${snapshot.address || '(none)'} is the next unused address, not the whole wallet.`
		);
	}
	const txid = await page.evaluate(
		async ({ destination, sats }) => {
			const send = (window as TreasuryWalletWindow).__sendBtc;
			if (!send) throw new Error('Treasury browser wallet send hook is missing.');
			return send({ address: destination, amountSats: sats, feeRate: 1 });
		},
		{ destination: address, sats: amountSats }
	);
	if (typeof txid !== 'string' || txid.length < 8) {
		throw new Error('Treasury send did not return a transaction id.');
	}
	return txid;
}

async function withTreasuryPage<T>(browser: Browser, run: (page: Page) => Promise<T>): Promise<T> {
	const network = process.env.VITE_BITCOIN_NETWORK ?? TESTNET_NETWORK;
	if (network !== TESTNET_NETWORK) {
		throw new Error('Treasury Bot is restricted to VITE_BITCOIN_NETWORK=testnet.');
	}
	const context = await browser.newContext();
	const page = await context.newPage();
	try {
		await signUpBot(page, 'treasury', E2E_BASE_URL);
		return await run(page);
	} finally {
		await context.close();
	}
}

export async function printTreasuryAddress(): Promise<string> {
	const browser = await chromium.launch({ headless: false, slowMo: 500 });
	const context = await browser.newContext();
	const page = await context.newPage();
	const baseUrl = process.env.BITTASKER_BASE_URL ?? 'http://localhost:3000';

	try {
		await signUpBot(page, 'treasury', baseUrl);
		await expect(page).toHaveURL(/\/wallet(?:[/?#]|$)/);

		await page.getByRole('button', { name: /receive/i }).click();
		await page.locator('[data-testid="receive-generate"]').click();
		const address = await page.locator('[data-testid="receive-value"]').textContent();
		const trimmedAddress = address?.trim() ?? '';
		if (!trimmedAddress.startsWith('tb1')) {
			throw new Error(`Expected a testnet address from the wallet UI, received ${trimmedAddress}`);
		}

		console.log(`Treasury Bot next unused receive address: ${trimmedAddress}`);
		return trimmedAddress;
	} finally {
		await context.close();
		await browser.close();
	}
}

export async function fundSubBot(
	browser: Browser,
	targetNpub: string,
	amountSats: number
): Promise<string> {
	if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
		throw new Error('amountSats must be a positive integer.');
	}

	const address = getRegisteredSubBotAddress(targetNpub);
	const txid = await withTreasuryPage(browser, (page) =>
		sendFromTreasuryPage(page, address, amountSats)
	);
	console.log(`Funded ${targetNpub} with ${amountSats} sats: ${txid}`);
	return txid;
}

export async function fundTestnetAddress(
	browser: Browser,
	address: string,
	amountSats: number
): Promise<string> {
	if (!/^tb1[a-z0-9]+$/.test(address)) {
		throw new Error('Destination must be a testnet tb1 address');
	}
	if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
		throw new Error('amountSats must be a positive integer.');
	}

	const txid = await withTreasuryPage(browser, (page) =>
		sendFromTreasuryPage(page, address, amountSats)
	);
	console.log(`Funded ${address} with ${amountSats} sats: ${txid}`);
	return txid;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	void printTreasuryAddress().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}

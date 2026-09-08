import { chromium, expect } from '@playwright/test';
import { getStaticBotIdentities, signUpBot, type BotIdentity } from './bot-auth';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const AUTH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.auth');
const SUB_BOT_ADDRESSES_FILE = path.join(AUTH_DIR, 'sub-bot-addresses.json');
const TESTNET_NETWORK = 'testnet';
const DEFAULT_ELECTRUM_URL = 'ssl://electrum.blockstream.info:60002';

interface TreasuryWallet {
	getAddress(): Promise<string>;
	getBtcBalance(): Promise<{
		vanilla: { spendable: number };
		colored: { spendable: number };
	}>;
	sendBtc(params: { address: string; amount: number; feeRate: number }): Promise<string>;
}

interface UtexoWalletModule {
	UTEXOWallet?: {
		create?(args: Record<string, unknown>): Promise<TreasuryWallet>;
	};
}

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

async function createTreasuryWallet(identity: TreasuryIdentity): Promise<TreasuryWallet> {
	const network = process.env.VITE_BITCOIN_NETWORK ?? TESTNET_NETWORK;
	const indexerUrl = process.env.VITE_BITCOIN_ELECTRUM_URL ?? DEFAULT_ELECTRUM_URL;
	if (network !== TESTNET_NETWORK) {
		throw new Error('Treasury Bot is restricted to VITE_BITCOIN_NETWORK=testnet.');
	}

	const rgbSdk = (await import('@utexo/rgb-sdk-web')) as unknown as UtexoWalletModule;
	const create = rgbSdk.UTEXOWallet?.create;
	if (!create) throw new Error('UTEXOWallet.create is unavailable.');

	const password = identity.mnemonic;
	return create({
		mnemonic: identity.mnemonic,
		password,
		network,
		indexerUrl,
		transportEndpoint:
			process.env.VITE_RGB_TRANSPORT_ENDPOINT ?? 'https://rgb-proxy.utexo.com/json-rpc',
		proxyUrl: process.env.VITE_RGB_LN_PROXY_URL ?? 'wss://ln-gateway-signet.utexo.com',
		vssUrl: process.env.VITE_UTEXO_VSS_URL ?? null
	});
}

export async function printTreasuryAddress(): Promise<string> {
	const browser = await chromium.launch({ headless: false, slowMo: 500 });
	const context = await browser.newContext();
	const page = await context.newPage();
	const baseUrl = process.env.BITTASKER_BASE_URL ?? 'http://localhost:3000';

	try {
		await signUpBot(page, 'treasury', baseUrl, true);
		await expect(page).toHaveURL(/\/wallet(?:[/?#]|$)/);

		await page.getByRole('button', { name: /receive/i }).click();
		await page.locator('[data-testid="receive-generate"]').click();
		const address = await page.locator('[data-testid="receive-value"]').textContent();
		const trimmedAddress = address?.trim() ?? '';
		if (!trimmedAddress.startsWith('tb1')) {
			throw new Error(`Expected a testnet address from the wallet UI, received ${trimmedAddress}`);
		}

		console.log(`Treasury Bot testnet address: ${trimmedAddress}`);
		return trimmedAddress;
	} finally {
		await context.close();
		await browser.close();
	}
}

export async function fundSubBot(targetNpub: string, amountSats: number): Promise<string> {
	if (!Number.isSafeInteger(amountSats) || amountSats <= 0) {
		throw new Error('amountSats must be a positive integer.');
	}

	const wallet = await createTreasuryWallet(getTreasuryIdentity());
	const balance = await wallet.getBtcBalance();
	const spendableSats = balance.vanilla.spendable + balance.colored.spendable;
	if (spendableSats < amountSats) {
		throw new Error(
			`Treasury balance ${spendableSats} sats is below requested ${amountSats} sats.`
		);
	}

	const address = getRegisteredSubBotAddress(targetNpub);
	const txid = await wallet.sendBtc({ address, amount: amountSats, feeRate: 1 });
	console.log(`Funded ${targetNpub} with ${amountSats} sats: ${txid}`);
	return txid;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	void printTreasuryAddress().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}

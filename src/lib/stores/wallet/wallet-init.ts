import type { UTEXOWallet } from '@utexo/rgb-sdk-web';
import type { RgbAsset, WalletProbeWindow } from './wallet-types';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { initWasm } from '$lib/wasm/init-wasm';
import { walletStore, state, clearRefreshTimers } from './wallet-state';
import { initialState } from './wallet-types';
import {
	browserIndexers,
	installEsploraRetryFetch,
	loadAssets,
	scanBtcBalance,
	unwrapListAssets
} from './wallet-balances';
import { rgbConsignmentSubscription } from '$lib/services/rgb/consignment-subscription';

type WalletFactory = (args: Record<string, unknown>) => Promise<UTEXOWallet> | UTEXOWallet;

const RGB_SDK_VERSION = '@utexo/rgb-sdk-web@1.0.0-beta.12';

async function sha256Hex(value: string): Promise<string> {
	const encoder = new TextEncoder();
	const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(value));
	return Array.from(new Uint8Array(hashBuffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

async function hashPrefix(value: string | null | undefined): Promise<string | null> {
	return value ? (await sha256Hex(value)).slice(0, 16) : null;
}

async function deriveUtexoWalletPassword(mnemonic: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(`bittasker-utexo-rgb-wallet:${mnemonic}`);
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function initializeRgbWallet(mnemonic: string): Promise<void> {
	if (!browser) return;
	const indexerUrl = import.meta.env.VITE_BITCOIN_ELECTRUM_URL as string | undefined;
	if (!indexerUrl) {
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			rgb: { ...s.rgb, initialized: false, error: 'Electrum missing' }
		}));
		throw new Error('Bitcoin Electrum indexer URL is not configured.');
	}

	try {
		const transportEndpoint =
			(import.meta.env.VITE_RGB_TRANSPORT_ENDPOINT as string | undefined) ??
			'https://rgb-proxy.utexo.com/json-rpc';
		const proxyUrl = import.meta.env.VITE_RGB_LN_PROXY_URL as string | undefined;
		const vssUrl = (import.meta.env.VITE_UTEXO_VSS_URL as string | undefined) ?? null;
		await initWasm();
		installEsploraRetryFetch();
		const rgbSdk = await import('@utexo/rgb-sdk-web');
		if (import.meta.env.DEV) {
			console.log(
				'[DEBUG SDK] keys:',
				Object.keys(rgbSdk).filter((k) => k !== 'default')
			);
		}
		const Ctor =
			rgbSdk.UTEXOWallet ??
			(rgbSdk as { RgbWallet?: unknown }).RgbWallet ??
			(rgbSdk as { Wallet?: unknown }).Wallet;

		const create: WalletFactory | null =
			typeof (Ctor as { create?: unknown })?.create === 'function'
				? ((Ctor as { create: WalletFactory }).create.bind(Ctor) as WalletFactory)
				: typeof Ctor === 'function'
					? (args: Record<string, unknown>) =>
							new (Ctor as new (input: Record<string, unknown>) => UTEXOWallet)(args)
					: null;

		if (!create) {
			throw new Error(
				`UTEXOWallet export unavailable. keys=${Object.keys(rgbSdk)
					.filter((k) => k !== 'default')
					.join(', ')}`
			);
		}
		const network = (import.meta.env.VITE_BITCOIN_NETWORK || 'testnet') as
			| 'mainnet'
			| 'testnet'
			| 'regtest';
		const password = await deriveUtexoWalletPassword(mnemonic);
		const mnemonicHash = await sha256Hex(mnemonic);
		const passwordHash = await sha256Hex(password);
		const walletFingerprint = await sha256Hex(
			`${mnemonicHash}:${passwordHash}:${network}:${RGB_SDK_VERSION}`
		);

		console.info('[wallet-diagnostic:init]', {
			mnemonic_hash: mnemonicHash.slice(0, 16),
			password_hash: passwordHash.slice(0, 16),
			fingerprint: walletFingerprint.slice(0, 16),
			network,
			sdk_version: RGB_SDK_VERSION,
			indexer_hash: await hashPrefix(indexerUrl),
			transport_hash: await hashPrefix(transportEndpoint),
			ln_proxy_hash: await hashPrefix(proxyUrl),
			vss_hash: await hashPrefix(vssUrl),
			vss_configured: Boolean(vssUrl)
		});

		const indexers = browserIndexers(indexerUrl, network);
		let wallet: UTEXOWallet | undefined;
		let lastIndexerError: unknown;
		for (const resolvedIndexer of indexers) {
			try {
				wallet = await create({
					mnemonic,
					password,
					network,
					indexerUrl: resolvedIndexer,
					transportEndpoint,
					vssUrl,
					...(proxyUrl ? { proxyUrl } : {})
				});
				console.info('[wallet-init] esplora indexer ready', resolvedIndexer);
				lastIndexerError = undefined;
				break;
			} catch (error) {
				lastIndexerError = error;
				console.warn('[wallet-init] esplora indexer rejected', resolvedIndexer, error);
			}
		}
		if (!wallet) {
			throw lastIndexerError instanceof Error
				? lastIndexerError
				: new Error('Invalid indexer: not a valid esplora server');
		}
		state.utexoWallet = wallet;

		const scanned = await scanBtcBalance(wallet);
		const address = scanned.address;
		const balanceSats = scanned.balanceSats;

		console.info('[wallet-diagnostic:ready]', {
			fingerprint: walletFingerprint.slice(0, 16),
			network,
			address,
			balance_sats: balanceSats,
			utxo_count: scanned.utxoCount
		});
		if (browser) {
			const probeWindow = window as WalletProbeWindow;
			if (
				probeWindow.__PLAYWRIGHT_TEST__ === true ||
				import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true'
			) {
				probeWindow.__btcAddress = address;
				probeWindow.__btcBalanceSats = balanceSats;
				probeWindow.__btcUtxoCount = scanned.utxoCount;
				probeWindow.__btcWalletSynced = true;
				probeWindow.__refreshBtcBalance = () => loadAssets();
				probeWindow.__sendBtc = (params) =>
					wallet.sendBtc({
						address: params.address,
						amount: params.amountSats,
						feeRate: params.feeRate ?? 1
					});
			}
		}

		let rgbAssets: RgbAsset[] = [];
		try {
			const rawAssets = await wallet.listAssets();
			rgbAssets = unwrapListAssets(rawAssets).map((a) => ({
				assetId: a.id,
				name: a.name ?? 'RGB Asset',
				symbol: a.ticker,
				balance: Number(a.balance ?? 0),
				formattedBalance: String(a.balance ?? 0)
			}));
		} catch (err) {
			console.warn('[wallet-init] listAssets skipped or failed:', err);
		}

		walletStore.update((s) => ({
			...s,
			isConnected: true,
			isInitializing: false,
			error: null,
			rgb: {
				initialized: true,
				error: null,
				address,
				balanceSats,
				formattedBalance: (balanceSats / 1e8).toFixed(8),
				assets: rgbAssets
			},
			wdk: {
				...s.wdk,
				initialized: true,
				error: null,
				btcOnchain: { address, balanceSats, formattedBalance: (balanceSats / 1e8).toFixed(8) }
			},
			totalBalances: {
				...s.totalBalances,
				sats: balanceSats,
				usdt:
					rgbAssets.find(
						(a) => a.assetId === (import.meta.env.VITE_RGB_USDT_ASSET_ID as string | undefined)
					)?.balance ?? 0
			}
		}));
		if (browser) {
			void rgbConsignmentSubscription
				.start({
					onError: (error) => console.warn('[wallet-init] RGB consignment ignored:', error)
				})
				.catch((error) => console.warn('[wallet-init] RGB consignment startup ignored:', error));
		}
	} catch (err) {
		console.warn('[wallet-init] RGB wallet init failed:', err);
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			rgb: { ...s.rgb, initialized: false, error: 'Init failed' }
		}));
		throw err;
	}
}

function isWasmGlobalError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const message = error.message.toLowerCase();
	return (
		message.includes('exports is not defined') ||
		message.includes('module is not defined') ||
		message.includes('.wasm') ||
		message.includes('wasm')
	);
}

async function waitForWasmGlobals(): Promise<void> {
	if (!browser) return;
	await new Promise<void>((resolve) => setTimeout(resolve, 50));
}

export async function getRgbAddress(): Promise<string> {
	const storeState = get(walletStore);
	if (storeState.rgb?.address) return storeState.rgb.address;
	try {
		await initialize();
	} catch {
		return '';
	}
	return get(walletStore).rgb?.address || '';
}

export async function initialize(): Promise<void> {
	if (!browser) return;
	const probeWindow = window as WalletProbeWindow;
	if (
		probeWindow.__PLAYWRIGHT_TEST__ === true ||
		import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true'
	) {
		probeWindow.__connectWallet = () => initialize();
	}
	const storeState = get(walletStore);
	if (storeState.isInitializing) return;

	walletStore.update((s) => ({ ...s, isInitializing: true, error: null }));

	if (state.utexoWallet && storeState.rgb?.initialized) {
		walletStore.update((s) => ({ ...s, isInitializing: false }));
		return;
	}

	try {
		await initWasm();
		const mnemonic = await getMnemonic();
		let lastError: unknown;
		for (let attempt = 0; attempt < 2; attempt += 1) {
			try {
				await initializeRgbWallet(mnemonic);
				return;
			} catch (error) {
				lastError = error;
				if (!isWasmGlobalError(error) || attempt === 1) break;
				await waitForWasmGlobals();
			}
		}

		console.warn('[wallet-init] Wallet initialization unavailable:', lastError);
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			error: lastError instanceof Error ? lastError.message : 'Failed to initialize wallet'
		}));
	} catch (error) {
		console.warn('[wallet-init] Wallet initialization setup failed:', error);
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			error: error instanceof Error ? error.message : 'Failed to initialize wallet'
		}));
	}
}

export function disconnectWallet(): void {
	rgbConsignmentSubscription.stop();
	if (state.utexoWallet && typeof state.utexoWallet.dispose === 'function') {
		try {
			void state.utexoWallet.dispose();
		} catch (error) {
			console.warn('[wallet-init] Wallet dispose failed:', error);
		}
	}
	state.utexoWallet = null;
	clearRefreshTimers();
	state.unsubscribeBlockWatch?.();
	state.unsubscribeBlockWatch = null;
	walletStore.set(structuredClone(initialState));
}

export const markExpectingInbound = (_ttlMs?: number) => {};

export const softCleanup = () => {};

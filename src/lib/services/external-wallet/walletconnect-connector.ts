/**
 * WalletConnect Connector — EVM signing via @walletconnect/ethereum-provider
 *
 * Uses @walletconnect/ethereum-provider directly (NOT @reownapp/appkit — no React).
 * QR display uses the Svelte-native WalletConnectQRModal.
 * Session persisted encrypted to Capacitor Preferences.
 *
 * Phases:
 *   connectWC() — inits provider, emits QR URI via callback, waits for approval
 *   restoreWCSession() — checks Preferences for saved session, attempts reconnect
 *   disconnectWC() — closes session, clears stored state
 */

import { EthereumProvider, type EthereumProviderOptions } from '@walletconnect/ethereum-provider';

type WCProvider = InstanceType<typeof EthereumProvider>;
import { Preferences } from '@capacitor/preferences';
import { ethers } from 'ethers';
import { get } from 'svelte/store';
import { t } from 'svelte-i18n';
import { tryCatch } from '$lib/utils/tryCatch';
import { appStore } from '$lib/stores/app.store';
import { unregisterConnectedWallet } from '$lib/stores/connected-wallets.store';
import type {
	ConnectorHandle,
	ConnectorEventCallback,
	EVMSigner,
	EVMTransactionRequest,
	EVMTransactionResult
} from './types';
import { sendLock } from '$lib/services/external-wallet/send-lock';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WC_PREFERENCES_KEY = 'bittasker_wc_session_v1';
const QR_TIMEOUT_MS = 120_000; // 2 minutes
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_MAX_RETRIES = 5;
const CHAIN_DEFAULT = 30; // RSK mainnet
const CHAINS_OPTIONAL = [1, 31, 56]; // Ethereum, RSK testnet, BSC
const CHAIN_RPC_URLS: Record<number, string> = {
	1: 'https://eth.llamarpc.com',
	30: 'https://public-node.rsk.co',
	31: 'https://public-node.testnet.rsk.co',
	56: 'https://bsc-dataseed.binance.org'
};
const WC_METADATA = {
	name: 'BitTasker',
	description: 'BitTasker Wallet',
	url: 'https://bittasker.com',
	icons: ['https://bittasker.com/favicon.ico']
};
const WC_ENCRYPTION_KEY_STORE = 'bittasker_wc_enc_key';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QRUriCallback = (uri: string) => void;

export interface WCConfig {
	chains?: number[];
	projectId?: string;
	onEvent?: ConnectorEventCallback;
}

interface StoredSessionData {
	topic: string;
	accounts: string[];
	chainId: number;
	connectedAt: number;
}

interface SessionStore {
	version: number;
	encrypted: string;
}

// ---------------------------------------------------------------------------
// Module State
// ---------------------------------------------------------------------------

let providerInstance: WCProvider | null = null;
let displayUriHandler: ((uri: string) => void) | null = null;
let accountsChangedHandler: ((accounts: string[]) => void) | null = null;
let chainChangedHandler: ((chainId: string) => void) | null = null;
let sessionDeleteHandler: (() => void) | null = null;
let sessionExpireHandler: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Encryption (Web Crypto API, AES-CBC)
// ---------------------------------------------------------------------------

async function getEncryptionKey(): Promise<CryptoKey> {
	// Check Preferences for a previously persisted key
	const { value: storedKey } = await Preferences.get({ key: WC_ENCRYPTION_KEY_STORE });

	let keyBytes: Uint8Array;

	if (storedKey) {
		// Decode stored base64-encoded key
		const binaryStr = atob(storedKey);
		keyBytes = new Uint8Array(binaryStr.length);
		for (let i = 0; i < binaryStr.length; i++) {
			keyBytes[i] = binaryStr.charCodeAt(i);
		}
	} else {
		// Derive a 256-bit key from the WalletConnect project ID via SHA-256
		const projectId = getProjectId();
		const encoder = new TextEncoder();
		const hashBuffer = await crypto.subtle.digest(
			'SHA-256',
			encoder.encode(projectId) as BufferSource
		);
		keyBytes = new Uint8Array(hashBuffer);

		// Persist the derived key for future sessions (base64-encoded)
		let binary = '';
		for (let i = 0; i < keyBytes.length; i++) {
			binary += String.fromCharCode(keyBytes[i]);
		}
		await Preferences.set({ key: WC_ENCRYPTION_KEY_STORE, value: btoa(binary) });
	}

	const { data: key, error } = await tryCatch(
		crypto.subtle.importKey(
			'raw',
			keyBytes as BufferSource,
			{ name: 'AES-CBC', length: 256 },
			false,
			['encrypt', 'decrypt']
		)
	);
	if (error || !key) {
		throw new Error('Failed to create encryption key for session storage');
	}
	return key;
}

async function encryptText(plaintext: string): Promise<string> {
	const cryptoKey = await getEncryptionKey();
	const iv = crypto.getRandomValues(new Uint8Array(16));
	const encoder = new TextEncoder();

	const { data: encrypted, error } = await tryCatch(
		crypto.subtle.encrypt(
			{ name: 'AES-CBC', iv },
			cryptoKey,
			encoder.encode(plaintext) as BufferSource
		)
	);
	if (error || !encrypted) {
		throw new Error('Failed to encrypt session data');
	}

	const combined = new Uint8Array(iv.length + encrypted.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(encrypted), iv.length);

	let binary = '';
	for (let i = 0; i < combined.length; i++) {
		binary += String.fromCharCode(combined[i]);
	}
	return btoa(binary);
}

async function decryptText(encoded: string): Promise<string> {
	const cryptoKey = await getEncryptionKey();

	let binary: string;
	try {
		binary = atob(encoded);
	} catch {
		throw new Error('Failed to decode encrypted session data');
	}

	const combined = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		combined[i] = binary.charCodeAt(i);
	}

	const iv = combined.slice(0, 16);
	const data = combined.slice(16);

	const { data: decrypted, error } = await tryCatch(
		crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, data as BufferSource)
	);
	if (error || !decrypted) {
		throw new Error('Failed to decrypt session data');
	}

	return new TextDecoder().decode(decrypted);
}

// ---------------------------------------------------------------------------
// Project ID
// ---------------------------------------------------------------------------

function getProjectId(): string {
	const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
	if (!projectId || typeof projectId !== 'string') {
		throw new Error(
			'WalletConnect projectId is required. Set VITE_WALLETCONNECT_PROJECT_ID in your .env file. ' +
				'Get a project ID from https://cloud.walletconnect.com'
		);
	}
	return projectId;
}

// ---------------------------------------------------------------------------
// Provider Initialization
// ---------------------------------------------------------------------------

async function initProvider(
	chains: number[] = [CHAIN_DEFAULT],
	projectId?: string
): Promise<WCProvider> {
	const pid = projectId || getProjectId();
	const optionalChains = CHAINS_OPTIONAL.filter((c) => !chains.includes(c));

	const rpcMap: Record<number, string> = {};
	for (const chain of [...chains, ...optionalChains]) {
		const url = CHAIN_RPC_URLS[chain];
		if (url) {
			rpcMap[chain] = url;
		}
	}

	const opts: EthereumProviderOptions = {
		projectId: pid,
		chains: chains as [number, ...number[]],
		optionalChains,
		showQrModal: false,
		rpcMap,
		metadata: WC_METADATA
	};

	const { data: provider, error } = await tryCatch(EthereumProvider.init(opts));

	if (error || !provider) {
		throw new Error(
			`Failed to initialize WalletConnect provider: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}

	return provider;
}

// ---------------------------------------------------------------------------
// Exponential backoff delay
// ---------------------------------------------------------------------------

function getReconnectDelay(attempt: number): number {
	const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt);
	return Math.min(delay, RECONNECT_MAX_DELAY_MS);
}

async function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Connector Handle Builder
// ---------------------------------------------------------------------------

function buildConnectorHandle(
	provider: WCProvider,
	address: string,
	chainId: number,
	chains: number[],
	onEvent: ConnectorEventCallback
): ConnectorHandle {
	const connectorId = `walletconnect-${address}`;

	const evmSigner: EVMSigner = {
		type: 'evm',
		label: 'WalletConnect',
		address,
		chainId,
		getAddress(): string {
			return address;
		},
		isConnected(): boolean {
			return providerInstance?.connected ?? false;
		},
		async sendTransaction(tx: EVMTransactionRequest): Promise<EVMTransactionResult> {
			sendLock.acquire(connectorId, () => {});
			try {
				const p = providerInstance;
				if (!p) {
					throw new Error('WalletConnect provider not initialized');
				}

				const params: Record<string, unknown> = {
					from: address,
					to: tx.to,
					chainId: `0x${tx.chainId.toString(16)}`
				};
				if (tx.value !== undefined) {
					params.value = `0x${tx.value.toString(16)}`;
				}
				if (tx.data) {
					params.data = tx.data;
				}

				const { data: txHash, error } = await tryCatch<string>(
					p.request({ method: 'eth_sendTransaction', params: [params] }) as Promise<string>
				);

				if (error || !txHash) {
					throw new Error(
						`WalletConnect transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
					);
				}

				return { txHash, from: address, chainId: tx.chainId };
			} finally {
				sendLock.release(connectorId);
			}
		}
	};

	// Build provider for ConnectorHandle (used as ethers.JsonRpcProvider bridge)
	let providerField: ethers.Provider | null = null;
	try {
		providerField = new ethers.BrowserProvider(
			provider as unknown as ethers.Eip1193Provider
		) as unknown as ethers.Provider;
	} catch {
		// BrowserProvider is best-effort; null is acceptable if it fails
		providerField = null;
	}

	// Capture references needed by fetchBalances (closure over address and chainIds)
	const fetchBalancesAddress = address;
	const fetchBalancesChainIds = [chainId, ...chains.filter((c) => c !== chainId)];

	async function fetchBalances(): Promise<
		Record<string, { raw: string; formatted: string; loading: boolean }>
	> {
		const result: Record<string, { raw: string; formatted: string; loading: boolean }> = {};
		console.log('[WalletConnect] fetchBalances: querying balances for', fetchBalancesAddress);

		const ethersProvider = providerField;
		if (!ethersProvider) {
			console.warn('[WalletConnect] fetchBalances: no ethers provider available');
			return result;
		}

		// --- rBTC native balance on RSK (chain 30) ---
		const hasRSK = fetchBalancesChainIds.includes(30) || fetchBalancesChainIds.includes(31);
		if (hasRSK) {
			try {
				const balance = await ethersProvider.getBalance(fetchBalancesAddress);
				// rBTC: 1 RBTC = 10^18 wei → convert to sats (1 RBTC = 10^8 sats, 1 wei = 10^-10 sats)
				// balance is in wei; divide by 10^10 to get sats
				const sats = Number(balance / 10_000_000_000n);
				result.rbtc = {
					raw: String(sats),
					formatted: sats.toLocaleString('en-US') + ' Sats',
					loading: false
				};
			} catch (e) {
				console.warn('[WalletConnect] fetchBalances rBTC failed:', e);
			}
		}

		// --- USDT on BSC (chain 56) ---
		// BSC USDT (BEP-20) — 18 decimals, verified contract address
		const USDT_BSC_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
		if (fetchBalancesChainIds.includes(56)) {
			try {
				const erc20Interface = new ethers.Interface([
					'function balanceOf(address) view returns (uint256)'
				]);
				const data = erc20Interface.encodeFunctionData('balanceOf', [fetchBalancesAddress]);
				const hexResult = await ethersProvider.call({
					to: USDT_BSC_CONTRACT,
					data
				});
				const raw = erc20Interface.decodeFunctionResult('balanceOf', hexResult)[0];
				const human = Number(raw) / 1e18;
				if (human > 0) {
					result.usdt = {
						raw: raw.toString(),
						formatted: '$' + human.toFixed(2),
						loading: false
					};
				}
			} catch (e) {
				console.warn('[WalletConnect] fetchBalances USDT BSC failed:', e);
			}
		}

		// --- WBTC on Arbitrum (chain 42161) ---
		// Only queried if Arbitrum is in the session's chain list
		if (fetchBalancesChainIds.includes(42161)) {
			try {
				const wbtcArbContract = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
				const erc20Interface = new ethers.Interface([
					'function balanceOf(address) view returns (uint256)'
				]);
				const data = erc20Interface.encodeFunctionData('balanceOf', [fetchBalancesAddress]);
				const hexResult = await ethersProvider.call({
					to: wbtcArbContract,
					data
				});
				const raw = erc20Interface.decodeFunctionResult('balanceOf', hexResult)[0];
				const human = Number(raw) / 1e8; // WBTC uses 8 decimals
				if (human > 0) {
					result.wbtc = {
						raw: raw.toString(),
						formatted: human.toFixed(8) + ' WBTC',
						loading: false
					};
				}
			} catch (e) {
				console.warn('[WalletConnect] fetchBalances WBTC Arbitrum failed:', e);
			}
		}

		console.log('[WalletConnect] fetchBalances result:', Object.keys(result));
		return result;
	}

	const handle: ConnectorHandle = {
		id: connectorId,
		walletName: 'WalletConnect',
		walletType: 'walletconnect',
		address,
		chainIds: fetchBalancesChainIds,
		evmSigner,
		provider: providerField,
		fetchBalances,
		onEvent,
		unsubscribe: () => {
			removeWCEventListeners(provider);
		}
	};

	return handle;
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function wireWCEvents(
	provider: WCProvider,
	handle: ConnectorHandle,
	onDisconnect: (isExpired?: boolean) => void
): void {
	const acctsHandler = (accts: string[]) => {
		if (accts.length === 0) {
			onDisconnect();
			return;
		}
		handle.onEvent({ type: 'accountsChanged', accounts: accts });
	};
	provider.on('accountsChanged', acctsHandler);
	accountsChangedHandler = acctsHandler;

	const chHandler = (newChainId: string) => {
		handle.onEvent({
			type: 'chainChanged',
			chainId: parseInt(newChainId, 16)
		});
	};
	provider.on('chainChanged', chHandler);
	chainChangedHandler = chHandler;

	const dcHandler = () => {
		handle.onEvent({ type: 'disconnect', reason: 'session_delete' });
		onDisconnect();
	};
	provider.on('session_delete', dcHandler);
	sessionDeleteHandler = dcHandler;

	const seHandler = () => {
		handle.onEvent({ type: 'disconnect', reason: 'session_expire' });
		onDisconnect(true);
	};
	provider.on('session_expire' as Parameters<typeof provider.on>[0], seHandler);
	sessionExpireHandler = seHandler;
}

function removeWCEventListeners(provider: WCProvider): void {
	if (displayUriHandler) {
		provider.removeListener('display_uri', displayUriHandler);
		displayUriHandler = null;
	}
	if (accountsChangedHandler) {
		provider.removeListener('accountsChanged', accountsChangedHandler);
		accountsChangedHandler = null;
	}
	if (chainChangedHandler) {
		provider.removeListener('chainChanged', chainChangedHandler);
		chainChangedHandler = null;
	}
	if (sessionDeleteHandler) {
		provider.removeListener('session_delete', sessionDeleteHandler);
		sessionDeleteHandler = null;
	}
	if (sessionExpireHandler) {
		provider.removeListener(
			'session_expire' as Parameters<typeof provider.removeListener>[0],
			sessionExpireHandler
		);
		sessionExpireHandler = null;
	}
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

async function persistWCSession(
	address: string,
	chainId: number,
	provider: WCProvider
): Promise<void> {
	try {
		const session = provider.session;
		const data: StoredSessionData = {
			topic: session?.topic ?? '',
			accounts: provider.accounts ?? [address],
			chainId,
			connectedAt: Date.now()
		};

		const encrypted = await encryptText(JSON.stringify(data));
		const store: SessionStore = { version: 1, encrypted };
		await Preferences.set({ key: WC_PREFERENCES_KEY, value: JSON.stringify(store) });
	} catch (error) {
		console.error('[WalletConnect] Failed to persist session:', error);
	}
}

async function loadStoredSession(): Promise<StoredSessionData | null> {
	try {
		const { value } = await Preferences.get({ key: WC_PREFERENCES_KEY });
		if (!value) return null;

		const store: SessionStore = JSON.parse(value);
		if (store.version !== 1 || !store.encrypted) {
			await clearStoredSession();
			return null;
		}

		const decrypted = await decryptText(store.encrypted);
		const session: StoredSessionData = JSON.parse(decrypted);

		if (!session.accounts?.length) {
			await clearStoredSession();
			return null;
		}

		return session;
	} catch (error) {
		console.error('[WalletConnect] Failed to load stored session:', error);
		await clearStoredSession();
		return null;
	}
}

async function clearStoredSession(): Promise<void> {
	try {
		await Preferences.remove({ key: WC_PREFERENCES_KEY });
	} catch (error) {
		console.error('[WalletConnect] Failed to clear stored session:', error);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Connect to a wallet via WalletConnect.
 *
 * @param config - Connection configuration (chains, optional projectId override)
 * @param onQRUri - Callback receiving the WC URI to display as a QR code
 * @returns ConnectorHandle for the connected wallet
 * @throws Error on timeout (2 min), cancellation, or connection failure
 */
export async function connectWC(
	config: WCConfig = {},
	onQRUri: QRUriCallback
): Promise<ConnectorHandle> {
	await disconnectWC();

	const chains = config.chains || [CHAIN_DEFAULT];

	const provider = await initProvider(chains, config.projectId);
	providerInstance = provider;

	const uriHandler = (uri: string) => {
		onQRUri(uri);
	};
	provider.on('display_uri', uriHandler);
	displayUriHandler = uriHandler;

	const timeoutPromise = new Promise<never>((_, reject) => {
		setTimeout(() => {
			reject(new Error('WalletConnect connection timed out after 2 minutes'));
		}, QR_TIMEOUT_MS);
	});

	try {
		const connectPromise = provider.connect();

		await Promise.race([connectPromise, timeoutPromise]);

		const accounts = provider.accounts;
		if (!accounts || accounts.length === 0) {
			throw new Error('No accounts returned from WalletConnect');
		}

		const address = accounts[0].toLowerCase();
		const chainId = provider.chainId || chains[0];

		const onEvent = config.onEvent ?? (() => {});
		const handle = buildConnectorHandle(provider, address, chainId, chains, onEvent);

		wireWCEvents(provider, handle, async (isExpired = false) => {
			await disconnectWC().catch(() => {});
			unregisterConnectedWallet(handle.id);
			if (isExpired) {
				appStore.showErrorToast(
					get(t)('wallet.connected.session_expired', {
						values: { name: handle.walletName }
					})
				);
			}
		});

		await persistWCSession(address, chainId, provider);

		return handle;
	} catch (error) {
		removeWCEventListeners(provider);
		providerInstance = null;
		await clearStoredSession();
		try {
			await provider.disconnect();
		} catch {
			// Ignore disconnect errors during cleanup
		}
		throw error;
	}
}

/**
 * Restore a previous WalletConnect session.
 *
 * Checks Capacitor Preferences for stored session metadata, then
 * attempts to reconnect via the provider's internal session restoration.
 * Uses exponential backoff (1s, 2s, 4s, 8s, 30s max, up to 5 attempts)
 * if the initial reconnect attempt fails.
 *
 * @returns ConnectorHandle if restored successfully, null otherwise
 */
export async function restoreWCSession(
	onEvent?: ConnectorEventCallback
): Promise<ConnectorHandle | null> {
	const sessionData = await loadStoredSession();
	if (!sessionData) return null;

	const chains = [sessionData.chainId];

	for (let attempt = 0; attempt < RECONNECT_MAX_RETRIES; attempt++) {
		try {
			const provider = await initProvider(chains);
			providerInstance = provider;

			// After init, the provider's internal loadPersistedSession should have
			// restored any existing session. Check if accounts are available.
			if (provider.connected && provider.accounts && provider.accounts.length > 0) {
				const address = provider.accounts[0].toLowerCase();
				const chainId = provider.chainId || sessionData.chainId;

				const handle = buildConnectorHandle(
					provider,
					address,
					chainId,
					chains,
					onEvent ?? (() => {})
				);

				wireWCEvents(provider, handle, async (isExpired = false) => {
					await disconnectWC().catch(() => {});
					unregisterConnectedWallet(handle.id);
					if (isExpired) {
						appStore.showErrorToast(
							get(t)('wallet.connected.session_expired', {
								values: { name: handle.walletName }
							})
						);
					}
				});

				// Refresh persisted data with updated session info
				await persistWCSession(address, chainId, provider);

				return handle;
			}

			// If provider didn't auto-restore, try connecting with the stored pairing topic
			if (sessionData.topic) {
				try {
					await provider.connect({ pairingTopic: sessionData.topic });
					if (provider.accounts && provider.accounts.length > 0) {
						const address = provider.accounts[0].toLowerCase();
						const chainId = provider.chainId || sessionData.chainId;

						const handle = buildConnectorHandle(
							provider,
							address,
							chainId,
							chains,
							onEvent ?? (() => {})
						);

						wireWCEvents(provider, handle, async (isExpired = false) => {
							await disconnectWC().catch(() => {});
							unregisterConnectedWallet(handle.id);
							if (isExpired) {
								appStore.showErrorToast(
									get(t)('wallet.connected.session_expired', {
										values: { name: handle.walletName }
									})
								);
							}
						});

						await persistWCSession(address, chainId, provider);

						return handle;
					}
				} catch {
					// Topic-based reconnect failed; will retry with backoff
					await provider.disconnect().catch(() => {});
					providerInstance = null;
				}
			}

			// Not restored yet — clean up and retry with backoff
			await disconnectWC();

			if (attempt < RECONNECT_MAX_RETRIES - 1) {
				await delay(getReconnectDelay(attempt));
			}
		} catch {
			// Init or reconnect error — clean up and retry
			providerInstance = null;
			await clearStoredSession();

			if (attempt < RECONNECT_MAX_RETRIES - 1) {
				await delay(getReconnectDelay(attempt));
			}
		}
	}

	// All retries exhausted
	await clearStoredSession();
	return null;
}

/**
 * Disconnect the WalletConnect session and clean up all state.
 */
export async function disconnectWC(): Promise<void> {
	if (providerInstance) {
		try {
			removeWCEventListeners(providerInstance);
			await providerInstance.disconnect();
		} catch (error) {
			console.warn('[WalletConnect] Error during disconnect:', error);
		}
		providerInstance = null;
	}

	await clearStoredSession();
}

/**
 * Check whether WalletConnect is currently connected.
 */
export function isWCConnected(): boolean {
	return providerInstance?.connected ?? false;
}

/**
 * Get the current WalletConnect provider instance, if any.
 */
export function getWCProvider(): WCProvider | null {
	return providerInstance;
}

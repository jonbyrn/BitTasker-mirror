/**
 * Connected Wallets Store — Manages external wallet connections and balances.
 *
 * Separate from wallet.store.ts to prevent regression risk for built-in
 * wallet functionality (imported by 30+ files). This store is only imported
 * by the Connected tab and send form when the feature flag is enabled.
 *
 * Single-writer principle: this store is the sole writer of connected
 * wallet state. Connectors return results; they never write to the store.
 */

import { writable, derived, get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
import type { ConnectorHandle } from '$lib/services/external-wallet/types';
import type { ConnectedWalletState } from '$lib/services/external-wallet/types';
import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
import { balancePoller } from '$lib/services/external-wallet/balance-poller';
import { createDebug } from '$lib/utils/debug';
const d = createDebug('connectedWallets');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const PREFERENCES_KEY = 'bittasker_connected_wallets';

export interface ConnectedWalletEntry {
	id: string;
	walletName: string;
	walletType: 'metamask' | 'walletconnect' | 'trezor' | 'ledger';
	address: string;
	chainIds: number[];
	balances: Record<string, { raw: string; formatted: string; loading: boolean }>;
	connectedAt: number;
	btcAddress?: string;
}

export interface ConnectedWalletsState {
	wallets: ConnectedWalletEntry[];
	activeWalletId: string | null;
	error: string | null;
	connectingType: string | null;
}

function createInitialState(): ConnectedWalletsState {
	return { wallets: [], activeWalletId: null, error: null, connectingType: null };
}

export const connectedWalletsStore = writable<ConnectedWalletsState>(createInitialState());

// ---------------------------------------------------------------------------
// Derived stores
// ---------------------------------------------------------------------------

/** Whether any connected wallets are available */
export const hasConnectedWallets = derived(connectedWalletsStore, ($s) => $s.wallets.length > 0);

/** Currently selected connected wallet entry */
export const activeConnectedWallet = derived(connectedWalletsStore, ($s) => {
	if (!$s.activeWalletId) return null;
	return $s.wallets.find((w) => w.id === $s.activeWalletId) ?? null;
});

// ---------------------------------------------------------------------------
// Query Facade — read-only access to connector registry state.
// Components should use these helpers instead of calling
// connectorRegistry.get() directly, to reduce bidirectional coupling.
//
// MIGRATION STATUS:
//   ✅ ConnectedWallets.svelte — derived stores (btcConnectedWallets, btcAddressFor)
//   ✅ wallet-connect-handlers.ts — _handleRefreshBalances
//   ✅ wallet-btc-handlers.ts — handleAdd*Bitcoin read-modify-write
//   ✅ ReceivePaymentForm.svelte — 2x connectorRegistry.get() migrated to getHandle()
//   ✅ SendPaymentForm.svelte — 3x connectorRegistry.get() migrated to getHandle()
//   ✅ ExternalWalletPaymentScreen.svelte — 1x connectorRegistry.get() migrated to getHandle()
//   ✅ swap-chain.service.ts — 1x connectorRegistry.get() migrated to getEvmSigner()
//   ℹ️  Connector init calls pass connectorRegistry as DI parameter (not .get())
// ---------------------------------------------------------------------------

/**
 * Check if a wallet has a Bitcoin signer registered in the connector registry.
 * Use this instead of `connectorRegistry.get(walletId)` in component render logic.
 */
export function hasBitcoinSigner(walletId: string): boolean {
	const handle = connectorRegistry.get(walletId);
	return handle?.bitcoinSigner !== undefined;
}

/**
 * Get the Bitcoin address for a wallet, or null if Bitcoin is not connected.
 * Use this instead of `connectorRegistry.get(walletId)?.bitcoinSigner?.address`.
 */
export function getBitcoinAddress(walletId: string): string | null {
	const handle = connectorRegistry.get(walletId);
	return handle?.bitcoinSigner?.address ?? null;
}

/**
 * Get the full ConnectorHandle for a wallet, or undefined if not registered.
 * Use this instead of `connectorRegistry.get(walletId)` in component logic.
 */
export function getHandle(walletId: string): ConnectorHandle | undefined {
	return connectorRegistry.get(walletId);
}

/**
 * Get the EVM signer for a wallet, or undefined if not available.
 * Use this instead of `connectorRegistry.get(walletId)?.evmSigner`.
 */
export function getEvmSigner(walletId: string): ConnectorHandle['evmSigner'] {
	return connectorRegistry.get(walletId)?.evmSigner;
}

/**
 * Get the Bitcoin signer for a wallet, or undefined if not available.
 * Use this instead of `connectorRegistry.get(walletId)?.bitcoinSigner`.
 */
export function getBitcoinSigner(walletId: string): ConnectorHandle['bitcoinSigner'] {
	return connectorRegistry.get(walletId)?.bitcoinSigner;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function registerConnectedWallet(handle: ConnectorHandle): void {
	if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)) return;

	connectorRegistry.register(handle);

	const entry: ConnectedWalletEntry = {
		id: handle.id,
		walletName: handle.walletName,
		walletType: handle.walletType,
		address: handle.address,
		chainIds: handle.chainIds,
		balances: {},
		connectedAt: Date.now(),
		btcAddress: handle.bitcoinSigner?.address ?? undefined
	};

	connectedWalletsStore.update((state) => {
		// Hardware wallets (Ledger, Trezor) can only have one active instance.
		// If an old entry from persistence has a different address (e.g. BTC
		// address from a previous session vs EVM address from a fresh connect),
		// remove the stale entry before adding the new one.
		const isHardware = handle.walletType === 'ledger' || handle.walletType === 'trezor';
		const filtered = isHardware
			? state.wallets.filter((w) => w.walletType !== handle.walletType)
			: state.wallets.filter((w) => w.id !== handle.id);
		return {
			...state,
			wallets: [...filtered, entry],
			activeWalletId: handle.id,
			error: null,
			connectingType: null
		};
	});

	// Fetch balances immediately, then start polling
	const fetcher = handle.fetchBalances;
	if (fetcher) {
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			console.warn('[Store] Offline — skipping initial balance fetch');
		} else {
			d.log('SDK wallet, fetching balances immediately...');
			fetcher()
				.then((balances) => {
					d.log('Initial balances:', balances);
					updateConnectedBalances(handle.id, balances);
				})
				.catch((e) => d.error('Initial fetch failed:', e));
		}
	}

	// Start balance polling for this wallet
	balancePoller.init().then(() => {
		balancePoller.start(handle.id, async () => {
			try {
				// SDK-based wallets: use fetchBalances if available
				if (fetcher) {
					const balances = await fetcher();
					updateConnectedBalances(handle.id, balances);
					return;
				}

				// Legacy ethers Provider-based wallets
				const provider = handle.provider;
				if (!provider) return;

				const balance = await provider.getBalance(handle.address);
				const raw = balance.toString();
				const padded = raw.padStart(19, '0');
				const whole = padded.slice(0, padded.length - 18).replace(/^0+/, '') || '0';
				const fraction = padded.slice(-18).slice(0, 6);

				updateConnectedBalances(handle.id, {
					native: { raw, formatted: `${whole}.${fraction}`, loading: false }
				});
			} catch (e) {
				// Polling errors are non-fatal — the UI shows the last-known balance
				console.warn('[Poll] Balance fetch failed:', e);
			}
		});
	});

	persistState();
}

/**
 * Replace a wallet's live handle without disconnecting the SDK session.
 * Used during auto-reconnect when the session is still valid — the old
 * handle is swapped for a new one without calling unsubscribe().
 */
export function replaceConnectedWallet(handle: ConnectorHandle): void {
	connectorRegistry.replace(handle);

	balancePoller.stop(handle.id);

	// Preserve existing balances from the old wallet entry so the UI
	// doesn't flash to $0 during handle migration (auto-reconnect, BTC
	// connection, etc.). Balances are refreshed asynchronously below.
	const existing = get(connectedWalletsStore).wallets.find((w) => w.id === handle.id);

	const entry: ConnectedWalletEntry = {
		id: handle.id,
		walletName: handle.walletName,
		walletType: handle.walletType,
		address: handle.address,
		chainIds: handle.chainIds,
		balances: existing?.balances ?? {},
		connectedAt: Date.now(),
		btcAddress: handle.bitcoinSigner?.address ?? undefined
	};

	connectedWalletsStore.update((state) => ({
		...state,
		wallets: state.wallets.map((w) => (w.id === handle.id ? entry : w)),
		activeWalletId: handle.id,
		error: null,
		connectingType: null
	}));

	// Fetch balances immediately
	const fetcher = handle.fetchBalances;
	if (fetcher) {
		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			console.warn('[Store] Offline — skipping balance fetch after replace');
		} else {
			fetcher()
				.then((balances) => updateConnectedBalances(handle.id, balances))
				.catch((e) => d.error('Initial fetch after replace failed:', e));
		}
	}

	// Resume polling
	balancePoller.init().then(() => {
		balancePoller.start(handle.id, async () => {
			try {
				if (fetcher) {
					const balances = await fetcher();
					updateConnectedBalances(handle.id, balances);
				}
			} catch (e) {
				// Polling errors are non-fatal — the UI shows the last-known balance
				console.warn('[Poll] Balance fetch failed:', e);
			}
		});
	});

	persistState();
}

export function unregisterConnectedWallet(walletId: string): void {
	connectorRegistry.unregister(walletId);

	balancePoller.stop(walletId);

	connectedWalletsStore.update((state) => ({
		...state,
		wallets: state.wallets.filter((w) => w.id !== walletId),
		activeWalletId: state.activeWalletId === walletId ? null : state.activeWalletId,
		error: null
	}));

	persistState();
}

export function setConnectingType(type: string | null): void {
	connectedWalletsStore.update((state) => ({ ...state, connectingType: type, error: null }));
}

export function setConnectedWalletError(error: string): void {
	connectedWalletsStore.update((state) => ({ ...state, error, connectingType: null }));
}

export function setActiveWallet(walletId: string | null): void {
	connectedWalletsStore.update((state) => ({ ...state, activeWalletId: walletId }));
}

export function updateConnectedBalances(
	walletId: string,
	balances: Record<string, { raw: string; formatted: string; loading: boolean }>
): void {
	connectedWalletsStore.update((state) => ({
		...state,
		wallets: state.wallets.map((w) =>
			w.id === walletId ? { ...w, balances: { ...w.balances, ...balances } } : w
		)
	}));
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistState(): Promise<void> {
	try {
		const state = get(connectedWalletsStore);
		const toPersist: ConnectedWalletState = {
			version: 2,
			wallets: state.wallets.map((w) => ({
				id: w.id,
				walletName: w.walletName,
				walletType: w.walletType,
				address: w.address,
				chainIds: w.chainIds,
				connectedAt: w.connectedAt,
				...(w.btcAddress ? { btcAddress: w.btcAddress } : {}),
				// Persist last-known balances so restored wallets show
				// instant data instead of $0.00 until the poller refreshes.
				balances: Object.keys(w.balances).length > 0 ? w.balances : undefined
			}))
		};
		await Preferences.set({ key: PREFERENCES_KEY, value: JSON.stringify(toPersist) });
	} catch (error) {
		d.error('Failed to persist state:', error);
	}
}

export async function restoreConnectedWalletState(): Promise<void> {
	d.log(
		'restoreConnectedWalletState called, flag:',
		FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)
	);
	if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)) return;

	try {
		d.log('Reading Preferences...');
		const { value } = await Preferences.get({ key: PREFERENCES_KEY });
		d.log('Preferences value:', value ? 'found' : 'empty');
		if (!value) return;

		const parsed: unknown = JSON.parse(value);
		if (!isValidPersistedState(parsed)) {
			await Preferences.remove({ key: PREFERENCES_KEY });
			return;
		}

		// Migration: clear old data if version < 2 (pre-Multichain SDK)
		if (parsed.version < 2) {
			await Preferences.remove({ key: PREFERENCES_KEY });
			connectedWalletsStore.set(createInitialState());
			return;
		}

		// Only restore if the store is empty — on SvelteKit navigation the
		// store already holds live wallet handles and must not be overwritten
		// with stale persisted data (which would unregister live SDK handles
		// and disconnect the MetaMask session).
		const currentWallets = get(connectedWalletsStore).wallets;
		if (currentWallets.length > 0) {
			d.log('Store already has wallets, skipping restore from persistence');
			return;
		}

		// Restore persisted wallets into the store (first load / page refresh).
		// Also rebuild the connector registry entry for wallets with BTC data
		// so the btcConnectedWallets derived check can find the bitcoinSigner.
		connectedWalletsStore.update((state) => ({
			...state,
			wallets: parsed.wallets.map((w) => ({
				id: w.id,
				walletName: w.walletName,
				walletType: w.walletType,
				address: w.address,
				chainIds: w.chainIds,
				// Restore last-known balances for instant display (stale > $0.00).
				// The balance poller will refresh these shortly after reconnect.
				balances:
					((w as Record<string, unknown>).balances as
						| Record<string, { raw: string; formatted: string; loading: boolean }>
						| undefined) ??
					({} as Record<string, { raw: string; formatted: string; loading: boolean }>),
				connectedAt: w.connectedAt,
				...(w.btcAddress ? { btcAddress: w.btcAddress } : {})
			}))
		}));

		// Register a minimal handle in the connector registry for wallets that
		// have BTC data. This allows the btcConnectedWallets derived check in
		// ConnectedWallets.svelte to detect the Bitcoin signer without needing
		// a live device connection (the address is available for display, real
		// signing re-establishes transport on demand).
		for (const w of parsed.wallets) {
			if (w.btcAddress) {
				const stubHandle = {
					id: w.id,
					walletName: w.walletName,
					walletType: w.walletType,
					address: w.address,
					chainIds: w.chainIds,
					provider: null,
					onEvent: () => {},
					unsubscribe: () => {},
					bitcoinSigner: {
						type: 'bitcoin' as const,
						label: 'Ledger',
						address: w.btcAddress,
						xpub: '',
						derivationPath: '',
						getAddress: () => w.btcAddress ?? '',
						getXPUB: () => '',
						isConnected: () => true,
						deriveChangeAddress: () => '',
						sendBitcoin: async () => {
							throw new Error('Reconnect Ledger to send Bitcoin');
						},
						signPSBT: async () => {
							throw new Error('Reconnect Ledger to sign PSBT');
						}
					}
				};
				connectorRegistry.register(stubHandle);
			}
		}

		// Trigger WalletConnect session restoration in background
		// (must not throw into this try/catch)
		(async () => {
			try {
				const { restoreWCSession } = await import(
					'$lib/services/external-wallet/walletconnect-connector'
				);
				await restoreWCSession().catch(() => {});
			} catch (e) {
				// WalletConnect module may not be available in all builds
				console.warn('[Restore] WalletConnect session restore failed:', e);
			}
		})();
	} catch (error) {
		d.error('Failed to restore state:', error);
		await Preferences.remove({ key: PREFERENCES_KEY });
	}
}

function isValidPersistedState(data: unknown): data is ConnectedWalletState {
	if (!data || typeof data !== 'object') return false;
	const d = data as Record<string, unknown>;
	if (typeof d.version !== 'number' || d.version < 1) return false;
	if (!Array.isArray(d.wallets)) return false;
	for (const w of d.wallets) {
		if (
			typeof w !== 'object' ||
			typeof w.id !== 'string' ||
			typeof w.address !== 'string' ||
			typeof w.walletType !== 'string'
		)
			return false;
	}
	return true;
}

export async function clearConnectedWalletState(): Promise<void> {
	connectorRegistry.clear();
	connectedWalletsStore.set(createInitialState());
	await Preferences.remove({ key: PREFERENCES_KEY });
}

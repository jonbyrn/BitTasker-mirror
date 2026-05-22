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
		connectedAt: Date.now()
	};

	connectedWalletsStore.update((state) => ({
		...state,
		wallets: [...state.wallets, entry],
		activeWalletId: handle.id,
		error: null,
		connectingType: null
	}));

	// Fetch balances immediately, then start polling
	const fetcher = (
		handle as {
			fetchBalances?: () => Promise<
				Record<string, { raw: string; formatted: string; loading: boolean }>
			>;
		}
	).fetchBalances;
	if (fetcher) {
		console.log('[ConnectedWallets] SDK wallet, fetching balances immediately...');
		fetcher()
			.then((balances) => {
				console.log('[ConnectedWallets] Initial balances:', balances);
				updateConnectedBalances(handle.id, balances);
			})
			.catch((e) => console.error('[ConnectedWallets] Initial fetch failed:', e));
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
			} catch {
				// Polling errors are non-fatal
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
				connectedAt: w.connectedAt
			}))
		};
		await Preferences.set({ key: PREFERENCES_KEY, value: JSON.stringify(toPersist) });
	} catch (error) {
		console.error('[ConnectedWallets] Failed to persist state:', error);
	}
}

export async function restoreConnectedWalletState(): Promise<void> {
	console.log(
		'[ConnectedWallets] restoreConnectedWalletState called, flag:',
		FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)
	);
	if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETS)) return;

	try {
		console.log('[ConnectedWallets] Reading Preferences...');
		const { value } = await Preferences.get({ key: PREFERENCES_KEY });
		console.log('[ConnectedWallets] Preferences value:', value ? 'found' : 'empty');
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

		// Restore persisted wallet metadata into the store.
		// Skip MetaMask — Multichain SDK sessions can't survive page reload.
		const restorable = parsed.wallets.filter((w) => w.walletType !== 'metamask');
		connectedWalletsStore.update((state) => ({
			...state,
			wallets: restorable.map((w) => ({
				id: w.id,
				walletName: w.walletName,
				walletType: w.walletType,
				address: w.address,
				chainIds: w.chainIds,
				balances: {},
				connectedAt: w.connectedAt
			}))
		}));

		// Trigger WalletConnect session restoration in background
		// (must not throw into this try/catch)
		(async () => {
			try {
				const { restoreWCSession } = await import(
					'$lib/services/external-wallet/walletconnect-connector'
				);
				await restoreWCSession().catch(() => {});
			} catch {
				// WalletConnect module may not be available
			}
		})();
	} catch (error) {
		console.error('[ConnectedWallets] Failed to restore state:', error);
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

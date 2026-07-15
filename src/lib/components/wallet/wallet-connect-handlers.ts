/**
 * Wallet Connect Handlers — Factory functions extracted from ConnectedWallets.svelte.
 *
 * Each handler that previously closed over component-level state is now a pure factory
 * that receives its dependencies explicitly. The caller (ConnectedWallets.svelte) wires
 * them to component-local $state() variables and store action functions.
 */

import { get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { t } from 'svelte-i18n';
import type { ConnectorHandle } from '$lib/services/external-wallet/types';
import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
import { getHandle as storeGetHandle } from '$lib/stores/connected-wallets.store';
import {
	isMetaMaskAvailable,
	isTrezorAvailable,
	getLedgerTransport,
	getPlatformInfo
} from '$lib/services/external-wallet/platform-checks';
import { FeatureFlagService, FEATURE_FLAGS } from '$lib/services/kill-switch';
import { appStore } from '$lib/stores/app.store';
import type { ConnectedWalletsState } from '$lib/stores/connected-wallets.store';

// ---------------------------------------------------------------------------
// Params Interfaces
// ---------------------------------------------------------------------------

/** Core store action functions shared by all connection handlers. */
export interface BaseHandlerParams {
	registerConnectedWallet: (h: ConnectorHandle) => void;
	unregisterConnectedWallet: (id: string) => void;
	setConnectingType: (t: string | null) => void;
	setConnectedWalletError: (e: string) => void;
}

/**
 * Params for `createCloseConnectModalHandler`.
 *
 * The close handler resets hardware-wallet step UI state (component-local
 * $state() variables) and clears store error/connectingType in one write.
 */
export interface CloseConnectModalParams extends BaseHandlerParams {
	/** The connected-wallets writable store (for direct .update() to clear error + connectingType). */
	connectedWalletsStore: Writable<ConnectedWalletsState>;

	// Component-local UI state setters ($state() variables in the component)
	setShowConnectModal: (v: boolean) => void;
	setShowLedgerConnect: (v: boolean) => void;
	setShowLedgerBtcStep: (v: boolean) => void;
	setShowLedgerBtcSuccess: (v: boolean) => void;
	setLedgerBtcError: (v: string) => void;
	setLedgerBtcConnecting: (v: boolean) => void;
	setShowTrezorBtcStep: (v: boolean) => void;
	setShowTrezorBtcSuccess: (v: boolean) => void;
	setTrezorBtcError: (v: string) => void;
	setTrezorBtcConnecting: (v: boolean) => void;
}

/** Params for `createConnectMetaMaskHandler`. */
export interface ConnectMetaMaskParams extends BaseHandlerParams {
	closeConnectModal: () => void;
}

/** Params for `createConnectWCHandler`. */
export interface ConnectWCHandlerParams extends BaseHandlerParams {
	closeConnectModal: () => void;
	setShowWCModal: (v: boolean) => void;
	setWcQRUri: (v: string | null) => void;
}

/** Params for `createWCCancelHandler`. */
export interface WCCancelParams {
	setShowWCModal: (v: boolean) => void;
	setWcQRUri: (v: string | null) => void;
	setConnectedWalletError: (e: string) => void;
}

/** Params for `createConnectTrezorHandler`. */
export interface ConnectTrezorParams extends BaseHandlerParams {
	setShowTrezorBtcStep: (v: boolean) => void;
	setTrezorBtcError: (v: string) => void;
	setTrezorBtcConnecting: (v: boolean) => void;
}

/** Params for `createConnectLedgerHandler`. */
export interface ConnectLedgerParams extends BaseHandlerParams {
	setShowConnectModal: (v: boolean) => void;
	setShowLedgerConnect: (v: boolean) => void;
	setShowLedgerBtcStep: (v: boolean) => void;
	setLedgerBtcError: (v: string) => void;
	setLedgerConnectError: (v: string) => void;
}

/** Params for `createRefreshBalancesHandler`. */
export interface RefreshBalancesParams {
	connectedWalletsStore: Writable<ConnectedWalletsState>;
}

// ---------------------------------------------------------------------------
// closeConnectModal
// ---------------------------------------------------------------------------

/**
 * Factory: creates the `closeConnectModal` handler.
 *
 * Resets all hardware-wallet step UI state and clears the store's error +
 * connectingType in a single atomic update.
 */
export function createCloseConnectModalHandler(params: CloseConnectModalParams): () => void {
	return () => {
		params.setShowConnectModal(false);
		params.setShowLedgerConnect(false);
		params.setShowLedgerBtcStep(false);
		params.setShowLedgerBtcSuccess(false);
		params.setLedgerBtcError('');
		params.setLedgerBtcConnecting(false);
		params.setShowTrezorBtcStep(false);
		params.setShowTrezorBtcSuccess(false);
		params.setTrezorBtcError('');
		params.setTrezorBtcConnecting(false);
		params.connectedWalletsStore.update((s) => ({ ...s, error: null, connectingType: null }));
	};
}

// ---------------------------------------------------------------------------
// handleConnectMetaMask
// ---------------------------------------------------------------------------

/**
 * Factory: creates the MetaMask connect handler.
 *
 * Copies the EXACT logic from ConnectedWallets.svelte handleConnectMetaMask()
 * (lines ~324-359). All dynamic imports, feature-flag checks, platform checks,
 * console.log debug messages, and error messages are preserved verbatim.
 */
export function createConnectMetaMaskHandler(params: ConnectMetaMaskParams): () => Promise<void> {
	return async () => {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_METAMASK)) {
			return;
		}
		if (!isMetaMaskAvailable()) {
			params.setConnectedWalletError(get(t)('wallet.connected.error_metamask_detection'));
			return;
		}
		params.setConnectingType('metamask');
		// Do NOT close the modal here — keep it open with a connecting state
		// so the user sees feedback while the SDK loads and MetaMask popup appears.
		// The modal will be closed on success (registerConnectedWallet) or error.

		try {
			const mod = await import('$lib/services/external-wallet/metamask-connector');
			const handle = await mod.connectMetaMask({
				registry: connectorRegistry,
				onEvent: (event) => {
					if (event.type === 'disconnect') {
						params.unregisterConnectedWallet(handle.id);
					}
				}
			});
			params.closeConnectModal();
			params.registerConnectedWallet(handle);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : get(t)('wallet.connected.error_metamask_connect');
			params.closeConnectModal();
			params.setConnectedWalletError(message);
		}
	};
}

// ---------------------------------------------------------------------------
// handleConnectWC
// ---------------------------------------------------------------------------

/**
 * Factory: creates the WalletConnect connect handler.
 *
 * Copies the EXACT logic from ConnectedWallets.svelte handleConnectWC()
 * (lines ~361-381). All dynamic imports, feature-flag checks, debug messages,
 * and error messages are preserved verbatim.
 */
export function createConnectWCHandler(params: ConnectWCHandlerParams): () => Promise<void> {
	return async () => {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_WALLETCONNECT)) return;
		params.setConnectingType('walletconnect');
		params.closeConnectModal();
		params.setShowWCModal(true);

		try {
			const { connectWC } = await import('$lib/services/external-wallet/walletconnect-connector');
			const handle = await connectWC({}, (uri: string) => {
				params.setWcQRUri(uri);
			});
			params.registerConnectedWallet(handle);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : get(t)('wallet.connected.error_walletconnect');
			params.setConnectedWalletError(message);
		} finally {
			params.setShowWCModal(false);
			params.setWcQRUri(null);
		}
	};
}

// ---------------------------------------------------------------------------
// handleWCCancel
// ---------------------------------------------------------------------------

/**
 * Factory: creates the WalletConnect cancel handler.
 *
 * Copies the EXACT logic from ConnectedWallets.svelte handleWCCancel()
 * (lines ~383-387).
 */
export function createWCCancelHandler(params: WCCancelParams): () => void {
	return () => {
		params.setShowWCModal(false);
		params.setWcQRUri(null);
		params.setConnectedWalletError('');
	};
}

// ---------------------------------------------------------------------------
// handleConnectTrezor
// ---------------------------------------------------------------------------

/**
 * Factory: creates the Trezor connect handler.
 *
 * Copies the EXACT logic from ConnectedWallets.svelte handleConnectTrezor()
 * (lines ~389-435). All dynamic imports, feature-flag checks, platform checks,
 * console.log debug messages, and error messages are preserved verbatim.
 */
export function createConnectTrezorHandler(params: ConnectTrezorParams): () => Promise<void> {
	return async () => {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_TREZOR)) {
			return;
		}
		const info = getPlatformInfo(window.navigator);
		if (!isTrezorAvailable(info)) {
			params.setConnectedWalletError(get(t)('wallet.connected.error_trezor_platform'));
			return;
		}

		// Step 1: EVM — keep modal open with connecting spinner
		params.setShowTrezorBtcStep(false);
		params.setTrezorBtcError('');
		params.setConnectingType('trezor');

		let handle: ConnectorHandle;
		try {
			const { connectTrezor } = await import('$lib/services/external-wallet/trezor-connector');
			handle = await connectTrezor({
				registry: connectorRegistry,
				navigator: window.navigator
			});
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : get(t)('wallet.connected.error_trezor_connect');
			params.setConnectedWalletError(msg);
			return;
		}

		// Step 2: Register EVM, then ask if user wants to add Bitcoin
		params.registerConnectedWallet(handle);

		// Clear connecting spinner, show BTC step prompt
		params.setConnectingType(null);
		params.setShowTrezorBtcStep(true);
		params.setTrezorBtcError('');
	};
}

// ---------------------------------------------------------------------------
// handleConnectLedger
// ---------------------------------------------------------------------------

/**
 * Factory: creates the Ledger connect handler.
 *
 * Copies the EXACT logic from ConnectedWallets.svelte handleConnectLedger()
 * (lines ~437-492). All dynamic imports, feature-flag checks, platform checks,
 * error messages, USB contention handling, and state transitions are
 * preserved verbatim.
 */
export function createConnectLedgerHandler(params: ConnectLedgerParams): () => Promise<void> {
	return async () => {
		if (!FeatureFlagService.isEnabled(FEATURE_FLAGS.CONNECTED_LEDGER)) return;
		const info = getPlatformInfo(window.navigator);
		const transport = getLedgerTransport(info);
		if (transport === 'unavailable') {
			params.setConnectedWalletError(get(t)('wallet.connected.error_ledger_platform'));
			return;
		}

		// Step 1: EVM — keep the modal open with a prompt screen
		params.setShowLedgerConnect(true);
		params.setShowConnectModal(true);
		params.setLedgerConnectError('');
		params.setShowLedgerBtcStep(false);
		params.setLedgerBtcError('');
		params.setConnectingType('ledger');

		let handle: ConnectorHandle;
		try {
			const { connectLedger } = await import('$lib/services/external-wallet/ledger-connector');
			handle = await connectLedger({
				registry: connectorRegistry,
				navigator: window.navigator
			});
		} catch (error) {
			const msg =
				error instanceof Error ? error.message : get(t)('wallet.connected.error_ledger_connect');

			// USB contention: another app (Ledger Live, etc.) is using the device
			const isUsbContention =
				msg.toLowerCase().includes('claiminterface') ||
				msg.toLowerCase().includes('claim interface') ||
				msg.toLowerCase().includes('in use');

			if (
				isUsbContention ||
				msg.toLowerCase().includes('ethereum') ||
				msg.toLowerCase().includes('open the') ||
				msg.toLowerCase().includes('ledger device')
			) {
				params.setLedgerConnectError(
					isUsbContention ? get(t)('wallet.connected.error_ledger_usb_in_use') : msg
				);
			} else {
				params.setShowLedgerConnect(false);
				params.setShowConnectModal(false);
				params.setConnectedWalletError(msg);
			}
			return;
		}

		// Step 2: Register EVM, then ask if user wants to add Bitcoin
		params.registerConnectedWallet(handle);
		params.setShowLedgerConnect(true); // keep modal for BTC step
		params.setLedgerConnectError('');
		params.setShowLedgerBtcStep(true);
		params.setLedgerBtcError('');
	};
}

// ---------------------------------------------------------------------------
// _handleRefreshBalances
// ---------------------------------------------------------------------------

/**
 * Factory: creates the balance refresh handler.
 *
 * Copies the EXACT logic from ConnectedWallets.svelte _handleRefreshBalances()
 * (lines ~178-216). Fetches all wallet balances in parallel, then batch-updates
 * only wallets whose balances changed (to avoid intermediate zero-flashes).
 */
export function createRefreshBalancesHandler(params: RefreshBalancesParams): () => Promise<void> {
	return async () => {
		const wallets = get(params.connectedWalletsStore).wallets;
		if (wallets.length === 0) return;

		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			console.warn('[ConnectedWallets] Offline — skipping balance refresh');
			return;
		}

		const results = await Promise.allSettled(
			wallets.map(async (w) => {
				const handle = storeGetHandle(w.id);
				if (!handle) return null;
				if (!handle.fetchBalances) return null;
				const balances = await handle.fetchBalances();
				return { id: w.id, balances };
			})
		);

		// Import once, apply only when balances actually changed
		const { updateConnectedBalances } = await import('$lib/stores/connected-wallets.store');
		for (const r of results) {
			if (r.status === 'fulfilled' && r.value) {
				const { id, balances } = r.value;
				// Only update if the new balances differ from existing (prevents layout shift)
				const existing = wallets.find((w) => w.id === id)?.balances ?? {};
				const hasChanged = Object.keys(balances).some(
					(k) => (balances[k]?.raw ?? '') !== (existing[k]?.raw ?? '')
				);
				if (hasChanged) {
					updateConnectedBalances(id, balances);
				}
			}
		}
		appStore.showSuccessToast(get(t)('wallet.connected.balances_refreshed'));
	};
}

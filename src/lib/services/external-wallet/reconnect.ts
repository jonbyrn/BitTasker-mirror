/**
 * Reconnect — Shared logic for restoring persisted connected wallets
 * and re-establishing live SDK sessions on app start / component mount.
 *
 * The identical reconnect pattern (restore → MetaMask reconnect → WC restore)
 * was duplicated in three components. Extracted here so all callers get the
 * same best-effort reconnection with Sentry breadcrumbs.
 */

import { get } from 'svelte/store';
import {
	connectedWalletsStore,
	restoreConnectedWalletState,
	replaceConnectedWallet
} from '$lib/stores/connected-wallets.store';
import { connectorRegistry } from '$lib/services/external-wallet/connector-registry';
import * as Sentry from '@sentry/sveltekit';

/**
 * Restore persisted connected wallets and attempt to re-establish live SDK
 * sessions so balances can be fetched. Safe to call from any component that
 * renders connected wallets.
 *
 * - Calls `restoreConnectedWalletState()` to hydrate from Capacitor Preferences
 * - Reconnects MetaMask via the Multichain SDK if a persisted session exists
 * - Restores WalletConnect session if one was persisted
 *
 * Errors are logged via Sentry breadcrumbs but do not throw —
 * reconnection is best-effort.
 */
export async function reconnectPersistedWallets(): Promise<void> {
	// Step 1: Restore persisted state from Capacitor Preferences
	try {
		await restoreConnectedWalletState();
	} catch (err) {
		console.warn('[Reconnect] restoreConnectedWalletState failed:', err);
		Sentry.addBreadcrumb({
			category: 'wallet',
			message: 'restoreConnectedWalletState failed',
			level: 'warning'
		});
		return; // Can't proceed without restored state
	}

	const wallets = get(connectedWalletsStore).wallets;

	const mmWallets = wallets.filter((w) => w.walletType === 'metamask');
	const wcWallets = wallets.filter((w) => w.walletType === 'walletconnect');

	// Import connector modules once upfront (not inside each loop iteration)
	const [mmModule, wcModule] = await Promise.all([
		mmWallets.length > 0
			? import('$lib/services/external-wallet/metamask-connector')
			: Promise.resolve(null),
		wcWallets.length > 0
			? import('$lib/services/external-wallet/walletconnect-connector')
			: Promise.resolve(null)
	]);

	// Run MetaMask and WalletConnect reconnections in parallel
	await Promise.allSettled([
		// Step 2: Reconnect MetaMask wallets
		(async () => {
			if (!mmModule) return;
			for (const w of mmWallets) {
				try {
					const handle = await mmModule.connectMetaMask({
						registry: connectorRegistry,
						onEvent: () => {},
						knownAddress: w.address,
						knownChainIds: w.chainIds,
						longTimeout: true
					});
					replaceConnectedWallet(handle);
				} catch (err) {
					console.warn('[Reconnect] MetaMask auto-reconnect failed:', err);
					Sentry.addBreadcrumb({
						category: 'wallet',
						message: 'MetaMask auto-reconnect failed',
						level: 'warning'
					});
				}
			}
		})(),

		// Step 3: Restore WalletConnect sessions
		(async () => {
			if (!wcModule) return;
			for (const _ of wcWallets) {
				try {
					const handle = await wcModule.restoreWCSession(() => {});
					if (handle) replaceConnectedWallet(handle);
				} catch (err) {
					console.warn('[Reconnect] WalletConnect auto-reconnect failed:', err);
					Sentry.addBreadcrumb({
						category: 'wallet',
						message: 'WalletConnect auto-reconnect failed',
						level: 'warning'
					});
				}
			}
		})()
	]);
}

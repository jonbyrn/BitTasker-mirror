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

	// Step 2: Reconnect persisted MetaMask wallets via Multichain SDK.
	// The SDK's connect() reuses an existing extension session when available,
	// so the user won't see a popup unless the session has expired.
	const mmWallets = wallets.filter((w) => w.walletType === 'metamask');
	for (const w of mmWallets) {
		try {
			const { connectMetaMask } = await import('$lib/services/external-wallet/metamask-connector');
			const handle = await connectMetaMask({
				registry: connectorRegistry,
				onEvent: () => {},
				knownAddress: w.address,
				knownChainIds: w.chainIds,
				longTimeout: true
			});
			// Replace the restored entry without disconnecting the SDK session
			replaceConnectedWallet(handle);
		} catch (err) {
			// Auto-reconnect silently fails — wallet shows with $0 balance
			console.warn('[Reconnect] MetaMask auto-reconnect failed:', err);
			Sentry.addBreadcrumb({
				category: 'wallet',
				message: 'MetaMask auto-reconnect failed',
				level: 'warning'
			});
		}
	}

	// Step 3: Restore persisted WalletConnect sessions.
	// Calls restoreWCSession() which loads the stored session and checks
	// if the provider still has valid accounts.
	const wcWallets = wallets.filter((w) => w.walletType === 'walletconnect');
	for (const _ of wcWallets) {
		try {
			const { restoreWCSession } = await import(
				'$lib/services/external-wallet/walletconnect-connector'
			);
			const handle = await restoreWCSession(() => {});
			if (handle) replaceConnectedWallet(handle);
		} catch (err) {
			// WalletConnect session restoration failed — shows $0 balance
			console.warn('[Reconnect] WalletConnect auto-reconnect failed:', err);
			Sentry.addBreadcrumb({
				category: 'wallet',
				message: 'WalletConnect auto-reconnect failed',
				level: 'warning'
			});
		}
	}
}

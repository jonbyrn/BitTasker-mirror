import { browser } from '$app/environment';
import { derived, get, writable } from 'svelte/store';
import { authState } from '$lib/stores/auth.store';
import { initialize, unlockWallet } from './wallet-init';
import { lightningStore } from './signet-lsp';
import {
	reconnectDecision,
	walletActionHold,
	walletConnection,
	type ReconnectReason,
	type WalletConnectionSnapshot
} from './wallet-connection';
import { isNsecUnlockRequired } from '$lib/utils/helpers/nsec-unlock';
import { walletStore } from './wallet-state';

interface WalletLinkState {
	online: boolean;
	unlocking: boolean;
	reconnecting: boolean;
	lastAttemptAt: number;
}

const PASSKEY_HINT =
	"We couldn't reach your passkey. If it's saved in a password manager (like Bitwarden), unlock it, then tap Retry.";

export const walletLink = writable<WalletLinkState>({
	online: true,
	unlocking: false,
	reconnecting: false,
	lastAttemptAt: 0
});

/** Derived status. Reading this store never asks for a passkey. */
export const walletConnectionStore = derived(
	[authState, walletStore, lightningStore, walletLink],
	([$auth, $wallet, $lightning, $link]): WalletConnectionSnapshot => {
		const usdt = ($wallet.rgb?.assets ?? []).find(
			(asset) => asset.symbol?.toUpperCase() === 'USDT' || asset.name?.toUpperCase() === 'USDT'
		);
		const address = $wallet.rgb?.address || $wallet.wdk?.btcOnchain?.address || '';
		return walletConnection({
			authenticated: $auth.isAuthenticated,
			online: $link.online,
			unlocking: $link.unlocking,
			reconnecting: $link.reconnecting,
			locked: $wallet.locked,
			initializing: $wallet.isInitializing,
			syncing: $wallet.syncing,
			connected: $wallet.isConnected,
			rgbInitialized: Boolean($wallet.rgb?.initialized),
			error: $wallet.error,
			rgbError: $wallet.rgb?.error ?? null,
			btcAddress: address,
			sats: $wallet.totalBalances?.sats ?? $wallet.rgb?.balanceSats ?? 0,
			usdtUnits: usdt?.balance ?? $wallet.totalBalances?.usdt ?? 0,
			usdtPrecision: usdt?.precision ?? 6,
			lightningReady: $lightning.ready,
			lightningChannel: $lightning.channel,
			lightningFailure: $lightning.failure
		});
	}
);

/** Empty when the action may run. The text is the inline reason. No navigation. */
export function walletBlocksAction(): string | null {
	const hold = walletActionHold(get(walletConnectionStore));
	return hold.hold ? hold.message : null;
}

/** Passkey runs only because a person tapped Unlock. An nsec account never starts WebAuthn. */
export async function unlockFromIndicator(nsec?: string): Promise<string | null> {
	walletLink.update((current) => ({ ...current, unlocking: true }));
	try {
		await unlockWallet(undefined, nsec);
		return null;
	} catch (error) {
		const message = unlockFailureText(error);
		walletStore.update((current) => ({
			...current,
			locked: current.isConnected ? current.locked : true,
			error: message
		}));
		return message;
	} finally {
		walletLink.update((current) => ({ ...current, unlocking: false }));
	}
}

/** Opens a cached session when one exists. Never asks for a passkey. */
export async function retryWalletLink(): Promise<void> {
	await reconnect('online');
}

function unlockFailureText(error: unknown): string {
	const message = error instanceof Error ? error.message.trim() : '';
	if (isNsecUnlockRequired(error)) {
		return PASSKEY_HINT;
	}
	if (
		message === 'unlock cancelled, tap to retry' ||
		message.toLowerCase().includes('timed out') ||
		message.toLowerCase().includes('not allowed')
	) {
		return PASSKEY_HINT;
	}
	return message || 'Wallet could not unlock. Tap Retry.';
}

async function reconnect(reason: ReconnectReason): Promise<void> {
	if (!browser) return;
	const link = get(walletLink);
	const snapshot = get(walletConnectionStore);
	const decision = reconnectDecision({
		authenticated: get(authState).isAuthenticated,
		online: reason === 'offline' ? false : link.online && navigator.onLine,
		phase: snapshot.phase,
		reason,
		msSinceAttempt:
			link.lastAttemptAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - link.lastAttemptAt
	});
	if (decision === 'offline') {
		walletLink.update((current) => ({ ...current, online: false }));
		return;
	}
	if (decision !== 'reconnect') return;
	walletLink.update((current) => ({
		...current,
		online: true,
		reconnecting: true,
		lastAttemptAt: Date.now()
	}));
	try {
		await initialize();
	} catch (error) {
		console.warn('[wallet-link] reconnect failed', error);
	} finally {
		walletLink.update((current) => ({ ...current, reconnecting: false }));
	}
}

let stopWatch: (() => void) | null = null;

/** Focus, tab visible, and network changes. Status stays on screen while this runs. */
export function watchWalletLink(): () => void {
	if (!browser) return () => undefined;
	if (stopWatch) return stopWatch;

	walletLink.update((current) => ({ ...current, online: navigator.onLine }));

	const onOffline = () => {
		void reconnect('offline');
	};
	const onOnline = () => {
		walletLink.update((current) => ({ ...current, online: true }));
		void reconnect('online');
	};
	const onFocus = () => {
		walletLink.update((current) => ({ ...current, online: navigator.onLine }));
		void reconnect('focus');
	};
	const onVisible = () => {
		if (document.visibilityState !== 'visible') return;
		walletLink.update((current) => ({ ...current, online: navigator.onLine }));
		void reconnect('visible');
	};

	window.addEventListener('offline', onOffline);
	window.addEventListener('online', onOnline);
	window.addEventListener('focus', onFocus);
	document.addEventListener('visibilitychange', onVisible);

	stopWatch = () => {
		window.removeEventListener('offline', onOffline);
		window.removeEventListener('online', onOnline);
		window.removeEventListener('focus', onFocus);
		document.removeEventListener('visibilitychange', onVisible);
		stopWatch = null;
	};
	return stopWatch;
}

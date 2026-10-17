const WALLET_TAB_LOCK = 'bittasker-rgb-wallet';

export const WALLET_TAB_BUSY =
	'This wallet is already open in another tab. Close that tab and tap Unlock.';

interface LockGrant {
	name: string;
}

interface LockRequest {
	mode?: 'exclusive' | 'shared';
	ifAvailable?: boolean;
}

/** The subset of the Web Locks API this wallet uses. */
export interface WalletLockManager {
	request<T>(
		name: string,
		options: LockRequest,
		callback: (lock: LockGrant | null) => Promise<T>
	): Promise<T>;
}

export interface WalletTabClaim {
	release: () => void;
}

/**
 * Hold the wallet engine in this tab. A second tab gets null immediately
 * instead of starting another wasm instance (that panics with BorrowError).
 * Browsers without Web Locks are treated as the only tab.
 */
export function claimWalletTab(locks?: WalletLockManager | null): Promise<WalletTabClaim | null> {
	if (!locks?.request) return Promise.resolve({ release: () => undefined });
	return new Promise((resolve) => {
		let releaseHold: () => void = () => undefined;
		const held = new Promise<void>((resolveHold) => {
			releaseHold = resolveHold;
		});
		void locks
			.request(WALLET_TAB_LOCK, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
				if (!lock) {
					resolve(null);
					return;
				}
				resolve({ release: releaseHold });
				await held;
			})
			.catch(() => resolve(null));
	});
}

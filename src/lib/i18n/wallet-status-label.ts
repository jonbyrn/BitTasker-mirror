/** English headlines from the wallet connection store, shown through i18n. */
const WALLET_STATUS_KEYS: Record<string, string> = {
	'Wallet locked, tap to unlock': 'navbar.wallet_lock.locked',
	'Unlock wallet to continue': 'navbar.wallet_lock.unlock_continue',
	'Unlocking…': 'navbar.wallet_lock.unlocking',
	'Syncing…': 'navbar.wallet_lock.syncing',
	'Wallet connected': 'navbar.wallet_lock.connected',
	'Logged out': 'navbar.wallet_lock.logged_out',
	'Unlock to see the balance': 'navbar.wallet_lock.unlock_balance',
	'Unlock to check': 'navbar.wallet_lock.unlock_check',
	'Log in to continue': 'navbar.wallet_lock.login_continue'
};

export function walletStatusMessageKey(headline: string): string | null {
	return WALLET_STATUS_KEYS[headline] ?? null;
}

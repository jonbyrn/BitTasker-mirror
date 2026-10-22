import { describe, expect, it } from 'vitest';
import { walletStatusMessageKey } from '$lib/i18n/wallet-status-label';

describe('wallet status labels', () => {
	it('maps the signed-out headline to the translated chip', () => {
		expect(walletStatusMessageKey('Logged out')).toBe('navbar.wallet_lock.logged_out');
	});
});

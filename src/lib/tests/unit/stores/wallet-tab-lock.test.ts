import { describe, expect, it } from 'vitest';
import { claimWalletTab, type WalletLockManager } from '$lib/stores/wallet/wallet-tab-lock';

function fakeLocks(held: { current: boolean }): WalletLockManager {
	return {
		async request(_name, _options, callback) {
			if (held.current) return callback(null);
			held.current = true;
			try {
				return await callback({ name: 'bittasker-rgb-wallet' });
			} finally {
				held.current = false;
			}
		}
	};
}

describe('claimWalletTab', () => {
	it('lets the first tab hold the wallet and tells the next tab to wait', async () => {
		const held = { current: false };
		const locks = fakeLocks(held);
		const first = await claimWalletTab(locks);
		expect(first).not.toBeNull();
		expect(await claimWalletTab(locks)).toBeNull();
		first?.release();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		const third = await claimWalletTab(locks);
		expect(third).not.toBeNull();
		third?.release();
	});

	it('allows the wallet when the browser has no lock API', async () => {
		const claim = await claimWalletTab(null);
		expect(claim).not.toBeNull();
	});
});

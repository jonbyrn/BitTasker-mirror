import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PASSKEY_UNLOCK_REQUIRED } from '$lib/utils/keys/passkey-policy';
import { isPasskeyUnlockError, walletNeedsPasskeyUnlock } from '$lib/utils/wallet/wallet-unlock';

describe('wallet passkey unlock', () => {
	it('asks for a passkey when this tab has no mnemonic', () => {
		expect(walletNeedsPasskeyUnlock(null)).toBe(true);
		expect(walletNeedsPasskeyUnlock(undefined)).toBe(true);
		expect(walletNeedsPasskeyUnlock('')).toBe(true);
		expect(walletNeedsPasskeyUnlock('   ')).toBe(true);
		expect(
			walletNeedsPasskeyUnlock(
				'legal winner thank year wave sausage worth useful legal winner thank yellow'
			)
		).toBe(false);
	});

	it('does not treat a missing mnemonic as a connection error', () => {
		expect(isPasskeyUnlockError(PASSKEY_UNLOCK_REQUIRED)).toBe(true);
		expect(isPasskeyUnlockError('Failed to connect to the network')).toBe(false);
		expect(isPasskeyUnlockError(null)).toBe(false);
	});

	it('has an obvious unlock label in English and Spanish', () => {
		const en = JSON.parse(readFileSync('static/locales/en/dashboard/wallet.json', 'utf8'));
		const es = JSON.parse(readFileSync('static/locales/es/dashboard/wallet.json', 'utf8'));
		expect(en.wallet.page.unlock_with_passkey).toBe('Unlock wallet with passkey');
		expect(en.wallet.page.unlock_with_passkey_hint).toBeTruthy();
		expect(es.wallet.page.unlock_with_passkey).toBeTruthy();
		expect(es.wallet.page.unlock_with_passkey).not.toBe(en.wallet.page.unlock_with_passkey);
		expect(es.wallet.page.unlock_with_passkey_hint).toBeTruthy();
	});
});

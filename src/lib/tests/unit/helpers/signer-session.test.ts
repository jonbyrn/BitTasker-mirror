import { describe, expect, it, vi } from 'vitest';
import {
	MNEMONIC_CIPHER_KEY,
	SIGNER_CIPHER_KEY,
	SIGNER_SESSION_TTL_MS,
	SESSION_TTL_MS,
	clearMnemonicSession,
	isTransientSessionError,
	sessionFresh,
	signerCached
} from '$lib/utils/helpers/session-mnemonic';
import { IndexedDbTimeoutError } from '$lib/utils/helpers/indexed-db-open';
import {
	PASSKEY_FAILED_MESSAGE,
	SignerLockedError,
	isPasskeyPromptError,
	passkeyErrorText
} from '$lib/utils/helpers/passkey-prompt';

describe('signer session window', () => {
	it('keeps a signer that is older than the wallet seed window', () => {
		const savedAt = Date.now() - (SESSION_TTL_MS + 60_000);
		expect(sessionFresh(savedAt, Date.now(), SESSION_TTL_MS)).toBe(false);
		expect(sessionFresh(savedAt, Date.now(), SIGNER_SESSION_TTL_MS)).toBe(true);
	});

	it('treats a blocked database open as a retry, not a missing session', () => {
		expect(
			isTransientSessionError(new IndexedDbTimeoutError('bittasker-wallet-session blocked'))
		).toBe(true);
		expect(isTransientSessionError(new Error('bittasker-wallet-session timed out'))).toBe(true);
		expect(isTransientSessionError(new Error('bad key'))).toBe(false);
	});

	it('reads a signer that is only in localStorage after a browser restart', () => {
		sessionStorage.removeItem(SIGNER_CIPHER_KEY);
		vi.mocked(localStorage.getItem).mockImplementation((key: string) =>
			key === SIGNER_CIPHER_KEY
				? JSON.stringify({ iv: 'a', data: 'b', at: Date.now() - 1_000 })
				: null
		);
		expect(signerCached()).toBe(true);
		vi.mocked(localStorage.getItem).mockImplementation(() => null);
	});

	it('drops a signer after eight hours', () => {
		const savedAt = Date.now() - (SIGNER_SESSION_TTL_MS + 1_000);
		expect(sessionFresh(savedAt, Date.now(), SIGNER_SESSION_TTL_MS)).toBe(false);
	});

	it('treats a fresh ciphertext as cached without reading the private key', () => {
		sessionStorage.setItem(
			SIGNER_CIPHER_KEY,
			JSON.stringify({ iv: 'a', data: 'b', at: Date.now() - 60_000 })
		);
		expect(signerCached()).toBe(true);
		sessionStorage.removeItem(SIGNER_CIPHER_KEY);
	});

	it('clears the wallet seed without deleting the signer ciphertext', async () => {
		sessionStorage.setItem(MNEMONIC_CIPHER_KEY, '{"iv":"a","data":"b","at":1}');
		sessionStorage.setItem(SIGNER_CIPHER_KEY, '{"iv":"c","data":"d","at":1}');
		await clearMnemonicSession();
		expect(sessionStorage.getItem(MNEMONIC_CIPHER_KEY)).toBeNull();
		expect(sessionStorage.getItem(SIGNER_CIPHER_KEY)).not.toBeNull();
		sessionStorage.removeItem(SIGNER_CIPHER_KEY);
	});
});

describe('passkey prompt errors', () => {
	it('names a timeout or cancel and keeps a retry message', () => {
		const timeout = new DOMException(
			'The operation either timed out or was not allowed.',
			'NotAllowedError'
		);
		expect(isPasskeyPromptError(timeout)).toBe(true);
		expect(isPasskeyPromptError(new SignerLockedError())).toBe(true);
		expect(passkeyErrorText(timeout)).toBe(PASSKEY_FAILED_MESSAGE);
		expect(passkeyErrorText(new Error('relay down'))).toBe('relay down');
	});
});

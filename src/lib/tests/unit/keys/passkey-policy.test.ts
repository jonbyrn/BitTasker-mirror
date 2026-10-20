import { describe, expect, it } from 'vitest';
import {
	PASSKEY_UNLOCK_REQUIRED,
	mayPromptForPasskey,
	passkeyPromptAllowed,
	withPasskeyPrompt
} from '$lib/utils/keys/passkey-policy';

describe('passkey policy', () => {
	it('blocks prompts outside an explicit action', () => {
		expect(passkeyPromptAllowed()).toBe(false);
		expect(mayPromptForPasskey()).toBe(false);
		expect(mayPromptForPasskey(true)).toBe(true);
		expect(PASSKEY_UNLOCK_REQUIRED).toBe('PASSKEY_UNLOCK_REQUIRED');
	});

	it('allows a prompt only while unlock, funding, or escrow is in progress', async () => {
		let seen = false;
		await withPasskeyPrompt('funding', async () => {
			seen = passkeyPromptAllowed();
		});
		expect(seen).toBe(true);
		expect(passkeyPromptAllowed()).toBe(false);
	});
});

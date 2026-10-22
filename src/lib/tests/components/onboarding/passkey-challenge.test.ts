import { addMessages } from 'svelte-i18n';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authService from '$lib/api/services/auth.service';

const CHALLENGE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NPUB = 'ab'.repeat(32);

function hang<T>(): Promise<T> {
	return new Promise<T>(() => undefined);
}

vi.mock('$lib/utils/helpers/crypto', () => ({
	deriveWalletFromNostr: vi.fn(async () => 'mnemonic words')
}));

vi.mock('$lib/utils/helpers/auth', () => ({
	encryptMasterKeyData: vi.fn(async () => ({
		encryptedData: { data: 'encrypted' },
		exportedKey: btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))
	}))
}));

vi.mock('$lib/utils/helpers/deviceIdentity', () => ({
	getDeviceIdentifier: vi.fn(async () => 'device-1'),
	createUserDeviceShortName: vi.fn(async () => 'web-abcd'),
	generatePasskeyName: vi.fn(async () => ({ name: 'ada@bittasker.com', displayName: 'ada' }))
}));

addMessages('en', {
	login: {
		biometric_errors: {
			network_error: 'Network error occurred. Please check your connection',
			api_error: 'Server error occurred. Please try again later'
		}
	},
	onboarding_auth: {
		form: {
			passkey_setup: {
				title: 'Passkey',
				next_gen_login: 'Next generation login',
				what_you_will_do: 'Create a passkey',
				learn_more: 'Learn more',
				back: 'Back',
				set_up_passkey: 'Set Up Passkey',
				setting_up: 'Setting up...',
				continue: 'Continue',
				setup_complete: 'Done',
				errors: { setup_failed: 'Setup failed' }
			}
		}
	}
});

import PasskeySetup from '$lib/components/onboarding/PasskeySetup.svelte';

describe.sequential('passkey setup challenge', () => {
	const credentialCreate = vi.fn(() => hang<Credential | null>());

	beforeEach(() => {
		vi.stubEnv('VITE_API_URL', 'https://api-staging.bittasker.com');
		vi.spyOn(authService, 'getChallenge').mockImplementation(() => hang());
		credentialCreate.mockClear();
		credentialCreate.mockImplementation(() => hang<Credential | null>());
		Object.defineProperty(window, 'PublicKeyCredential', {
			configurable: true,
			value: class PublicKeyCredential {}
		});
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { get: vi.fn(), create: credentialCreate }
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	function renderStep() {
		render(PasskeySetup, {
			props: {
				username: 'ada',
				npub: NPUB,
				nsec: 'nsec-test',
				nextStep: vi.fn(),
				prevStep: vi.fn()
			}
		});
	}

	it('creates the passkey with the challenge fetched before the click', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({ challenge: CHALLENGE })
			}))
		);
		renderStep();

		const button = await screen.findByTestId('passkey-setup-button');
		await waitFor(() => expect(button).not.toBeDisabled());
		await fireEvent.click(button);

		await waitFor(() => expect(credentialCreate).toHaveBeenCalledTimes(1));
		expect(authService.getChallenge).not.toHaveBeenCalled();
		const request = credentialCreate.mock.calls[0]?.[0] as {
			publicKey: { challenge: ArrayBuffer };
		};
		expect(Array.from(new Uint8Array(request.publicKey.challenge))).toEqual(
			Array.from(Uint8Array.from(atob(CHALLENGE), (c) => c.charCodeAt(0)))
		);
	});

	it('shows a server error without opening WebAuthn when the challenge endpoint fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (String(url).includes('/auth/challenge')) {
					return { ok: false, status: 500, json: async () => ({ message: 'unavailable' }) };
				}
				return { ok: false, status: 404, json: async () => ({}) };
			})
		);
		renderStep();

		expect(
			await screen.findByText('Server error occurred. Please try again later')
		).toBeInTheDocument();
		expect(credentialCreate).not.toHaveBeenCalled();
		expect(authService.getChallenge).not.toHaveBeenCalled();
	});
});

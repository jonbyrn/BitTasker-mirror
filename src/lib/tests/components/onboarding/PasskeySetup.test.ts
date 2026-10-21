import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { setBiometricKey, checkBiometricAvailability } = vi.hoisted(() => ({
	setBiometricKey: vi.fn(),
	checkBiometricAvailability: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key), locale: readable('en') };
});

vi.mock('$lib/utils/helpers/biometrics', () => ({
	setBiometricKey,
	checkBiometricAvailability,
	takePasskeyChallenge: vi.fn(() => 'challenge'),
	prefetchPasskeyChallenge: vi.fn()
}));

vi.mock('$lib/utils/helpers/crypto', () => ({
	deriveWalletFromNostr: vi.fn().mockResolvedValue('test mnemonic')
}));

vi.mock('$lib/utils/helpers/deviceIdentity', () => ({
	createUserDeviceShortName: vi.fn().mockResolvedValue('device'),
	getDeviceIdentifier: vi.fn().mockResolvedValue('device-id')
}));

vi.mock('$lib/utils/helpers/auth', () => ({
	encryptMasterKeyData: vi.fn().mockResolvedValue({ encryptedData: 'enc', exportedKey: 'key' })
}));

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		getChallenge: vi.fn(),
		nostrLogin: vi.fn(),
		register: vi.fn()
	}
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: {
		setupAuthData: vi.fn(),
		login: vi.fn()
	}
}));

vi.mock('nostr-tools/pure', () => ({
	finalizeEvent: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	decodeNsec: vi.fn()
}));

import PasskeySetup from '$lib/components/onboarding/PasskeySetup.svelte';

function namedError(name: string, message: string): Error {
	const error = new Error(message);
	error.name = name;
	return error;
}

describe('PasskeySetup', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it('keeps Back enabled while passkey setup is still waiting', async () => {
		checkBiometricAvailability.mockResolvedValue(true);
		setBiometricKey.mockReturnValue(new Promise(() => undefined));
		const prevStep = vi.fn();
		const { getByTestId } = render(PasskeySetup, {
			username: 'ada',
			npub: 'cd'.repeat(32),
			nsec: 'ab'.repeat(32),
			nextStep: vi.fn(),
			prevStep
		});

		await waitFor(() => {
			expect(getByTestId('passkey-setup-button').hasAttribute('disabled')).toBe(false);
		});
		await fireEvent.click(getByTestId('passkey-setup-button'));
		await waitFor(() => {
			expect(getByTestId('passkey-setup-button').textContent).toContain(
				'onboarding_auth.form.passkey_setup.setting_up'
			);
		});

		const back = getByTestId('passkey-setup-back');
		expect(back.hasAttribute('disabled')).toBe(false);
		await fireEvent.click(back);
		expect(prevStep).toHaveBeenCalledOnce();
	});

	it('shows a timeout error with retry and a skip to the Nostr key', async () => {
		checkBiometricAvailability.mockResolvedValue(true);
		setBiometricKey.mockRejectedValue(namedError('TimeoutError', 'Passkey setup timed out'));
		const { getByTestId } = render(PasskeySetup, {
			username: 'ada',
			npub: 'cd'.repeat(32),
			nsec: 'ab'.repeat(32),
			nextStep: vi.fn(),
			prevStep: vi.fn()
		});

		await waitFor(() => {
			expect(getByTestId('passkey-setup-button').hasAttribute('disabled')).toBe(false);
		});
		await fireEvent.click(getByTestId('passkey-setup-button'));

		await waitFor(() => {
			expect(getByTestId('passkey-setup-error').textContent).toContain(
				'onboarding_auth.form.passkey_setup.errors.timed_out'
			);
		});
		expect(getByTestId('passkey-setup-skip')).toBeTruthy();
		expect(getByTestId('passkey-setup-button').textContent).toContain(
			'onboarding_auth.form.passkey_setup.retry'
		);
		expect(getByTestId('passkey-setup-back').hasAttribute('disabled')).toBe(false);
	});

	it('offers a key backup before passkey setup fails', async () => {
		const { getByTestId, queryByTestId } = render(PasskeySetup, {
			username: 'ada',
			npub: 'cd'.repeat(32),
			nsec: 'ab'.repeat(32),
			nextStep: vi.fn(),
			prevStep: vi.fn()
		});

		expect(getByTestId('passkey-setup-backup')).toBeTruthy();
		expect(queryByTestId('passkey-setup-skip')).toBeNull();
		await fireEvent.click(getByTestId('passkey-setup-backup'));
		expect(getByTestId('passkey-setup-backup-panel')).toBeTruthy();
		expect(
			(getByTestId('passkey-setup-nsec') as HTMLTextAreaElement).value.startsWith('nsec1')
		).toBe(true);
	});

	it('opens the key backup when signup asks for it', () => {
		const { getByTestId } = render(PasskeySetup, {
			username: 'ada',
			npub: 'cd'.repeat(32),
			nsec: 'ab'.repeat(32),
			nextStep: vi.fn(),
			prevStep: vi.fn(),
			openBackup: true
		});

		expect(getByTestId('passkey-setup-backup-panel')).toBeTruthy();
		expect(
			(getByTestId('passkey-setup-nsec') as HTMLTextAreaElement).value.startsWith('nsec1')
		).toBe(true);
	});
});

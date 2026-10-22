import { addMessages } from 'svelte-i18n';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({
	prefetchPasskeyChallenge: vi.fn<() => Promise<void>>(),
	peekPasskeyChallenge: vi.fn<() => string | null>(() => null),
	passkeyChallengeFailure: vi.fn(() => null as 'network' | 'api' | null),
	getBiometricData: vi.fn(() => new Promise(() => undefined)),
	checkBiometricAvailability: vi.fn(async () => true),
	checkNativePlatform: vi.fn(() => false),
	setBiometricKey: vi.fn()
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	prefetchPasskeyChallenge: () => calls.prefetchPasskeyChallenge(),
	peekPasskeyChallenge: () => calls.peekPasskeyChallenge(),
	passkeyChallengeFailure: () => calls.passkeyChallengeFailure(),
	getBiometricData: (...args: unknown[]) => calls.getBiometricData(...args),
	checkBiometricAvailability: () => calls.checkBiometricAvailability(),
	checkNativePlatform: () => calls.checkNativePlatform(),
	setBiometricKey: (...args: unknown[]) => calls.setBiometricKey(...args)
}));

addMessages('en', {
	login: {
		subtitle: 'Sign in',
		continue_passkey: 'Continue with a passkey',
		create_account: 'Create account',
		biometric_errors: {
			network_error: 'Network error occurred. Please check your connection',
			api_error: 'Server error occurred. Please try again later'
		}
	},
	common: { or: 'or', processing: 'Processing' }
});

import LoginPage from '../../../../routes/(app)/auth/login/+page.svelte';

describe('passkey login challenge', () => {
	beforeEach(() => {
		calls.prefetchPasskeyChallenge.mockReset();
		calls.peekPasskeyChallenge.mockReset();
		calls.passkeyChallengeFailure.mockReset();
		calls.getBiometricData.mockClear();
		calls.peekPasskeyChallenge.mockReturnValue(null);
		calls.passkeyChallengeFailure.mockReturnValue(null);
		calls.getBiometricData.mockImplementation(() => new Promise(() => undefined));
	});

	it('opens WebAuthn on the first click once a challenge is ready', async () => {
		let release: () => void = () => undefined;
		calls.prefetchPasskeyChallenge.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					release = () => {
						calls.peekPasskeyChallenge.mockReturnValue('ready-challenge');
						resolve();
					};
				})
		);

		render(LoginPage);
		const button = await screen.findByTestId('login-continue-passkey');
		expect(button).toBeDisabled();
		expect(calls.getBiometricData).not.toHaveBeenCalled();

		release();
		await waitFor(() => expect(button).not.toBeDisabled());
		await fireEvent.click(button);

		expect(calls.getBiometricData).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Tap again to approve your passkey')).toBeNull();
	});

	it('shows a server error and does not open WebAuthn when the challenge fetch fails', async () => {
		calls.prefetchPasskeyChallenge.mockResolvedValue(undefined);
		calls.passkeyChallengeFailure.mockReturnValue('api');

		render(LoginPage);

		expect(
			await screen.findByText('Server error occurred. Please try again later')
		).toBeInTheDocument();
		expect(calls.getBiometricData).not.toHaveBeenCalled();
	});
});

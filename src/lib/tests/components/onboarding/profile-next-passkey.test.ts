import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { packKeys } from '$lib/utils/helpers/encoding';
import { appStore } from '$lib/stores/app.store';
import { PASSKEY_APPROVE_MESSAGE } from '$lib/utils/helpers/passkey-prompt';
import authService from '$lib/api/services/auth.service';
import { peekPasskeyChallenge, cancelPasskeyPrompt } from '$lib/utils/helpers/biometrics';

const CHALLENGE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const CREDENTIAL_ID = 'cGFzc2tleS1pZC0x';
const NPUB = '22'.repeat(32);
const NSEC = '11'.repeat(32);
const EXPORTED = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

const calls = vi.hoisted(() => ({
	publishProfileMetadata: vi.fn(async () => ({ id: 'profile-event' }))
}));

vi.mock('$lib/nostr/profile', async () => {
	const actual = await vi.importActual<typeof import('$lib/nostr/profile')>('$lib/nostr/profile');
	return {
		...actual,
		publishProfileMetadata: (...args: unknown[]) => calls.publishProfileMetadata(...args),
		publishSkillsUpdate: vi.fn(async () => undefined),
		publishMultipleImages: vi.fn(async () => undefined)
	};
});

vi.mock('$lib/nostr/ndk', () => ({
	syncNdkSignerFromAppStore: vi.fn(async () => undefined),
	applyNdkSignerFromNsec: vi.fn(async () => undefined),
	ndk: { signer: null }
}));

vi.mock('$lib/utils/helpers/auth', async () => {
	const actual = await vi.importActual<typeof import('$lib/utils/helpers/auth')>(
		'$lib/utils/helpers/auth'
	);
	return {
		...actual,
		decryptNsecWithBiometrics: vi.fn(async () => NSEC),
		decryptMasterKeyDataFromBiometrics: vi.fn(async () => ({
			nsec: NSEC,
			mnemonic: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
		})),
		encryptMasterKeyData: vi.fn(async () => ({
			encryptedData: { data: 'cipher', iv: 'iv', salt: 'salt' },
			exportedKey: EXPORTED
		}))
	};
});

vi.mock('$lib/stores/wallet/wallet-init', () => ({
	initialize: vi.fn(async () => undefined)
}));

import ProfileSetup from '$lib/components/onboarding/ProfileSetup.svelte';
import RecoverySetup from '$lib/components/onboarding/RecoverySetup.svelte';
import CompleteSetup from '$lib/components/onboarding/CompleteSetup.svelte';
import { goto } from '$app/navigation';

function storageMap() {
	const storage = new Map<string, string>();
	vi.mocked(localStorage.getItem).mockImplementation((key: string) => storage.get(key) ?? null);
	vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
		storage.set(key, value);
	});
	vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
		storage.delete(key);
	});
	vi.mocked(localStorage.clear).mockImplementation(() => storage.clear());
	return storage;
}

describe.sequential('onboarding next passkey', () => {
	const credentialGet = vi.fn();
	let userHandle: ArrayBuffer;

	beforeEach(() => {
		vi.stubEnv('VITE_API_URL', 'https://api-staging.bittasker.com');
		vi.stubEnv('VITE_E2E_TEST', '');
		vi.stubEnv('VITE_E2E_TURNSTILE_BYPASS', '');
		vi.stubEnv('VITE_SKIP_PASSKEY', '');
		sessionStorage.clear();
		const storage = storageMap();
		storage.set(`CapacitorStorage.${StorageKeys.WEB_AUTHN_CREDENTIAL_ID}`, CREDENTIAL_ID);
		storage.set(StorageKeys.NPUB, NPUB);
		userHandle = packKeys(NPUB, EXPORTED);
		appStore.update((state) => ({
			...state,
			nostrKeys: { nsec: null, npub: null, mnemonic: null },
			biometricData: null
		}));
		calls.publishProfileMetadata.mockClear();
		calls.publishProfileMetadata.mockResolvedValue({ id: 'profile-event' } as never);
		vi.mocked(Preferences.get).mockImplementation(async ({ key }: { key: string }) => {
			if (key === StorageKeys.NPUB) return { value: NPUB };
			if (key === StorageKeys.WEB_AUTHN_CREDENTIAL_ID) return { value: CREDENTIAL_ID };
			if (key === StorageKeys.ACCESS_TOKEN) return { value: 'access-token' };
			return { value: null };
		});
		vi.spyOn(authService, 'getPasskeyEncryptedData').mockResolvedValue({
			encryptedData: { data: 'cipher', iv: 'iv', salt: 'salt' }
		} as never);
		vi.spyOn(authService, 'setupRecovery').mockResolvedValue({} as never);
		vi.mocked(goto).mockResolvedValue(undefined as never);
		credentialGet.mockReset();
		credentialGet.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolve({
						id: CREDENTIAL_ID,
						rawId: new ArrayBuffer(8),
						type: 'public-key',
						response: {
							authenticatorData: new Uint8Array(37).buffer,
							clientDataJSON: new TextEncoder().encode('{}').buffer,
							signature: new Uint8Array(8).buffer,
							userHandle
						}
					});
				})
		);
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { get: credentialGet, create: vi.fn() }
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ challenge: CHALLENGE })
			}))
		);
	});

	afterEach(() => {
		cancelPasskeyPrompt();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
	});

	it('asks for the saved passkey on an empty profile and then continues', async () => {
		const nextStep = vi.fn();
		render(ProfileSetup, { props: { displayName: 'Ada Lovelace', nextStep, prevStep: vi.fn() } });

		await waitFor(() => {
			expect(peekPasskeyChallenge()).toBeTruthy();
		});
		await fireEvent.click(screen.getByTestId('onboarding-profile-next'));

		await waitFor(() => {
			expect(credentialGet).toHaveBeenCalledTimes(1);
		});
		const request = credentialGet.mock.calls[0]?.[0] as {
			publicKey: { allowCredentials: { id: ArrayBuffer }[] };
		};
		const id = new Uint8Array(request.publicKey.allowCredentials[0].id);
		expect(Array.from(id)).toEqual(
			Array.from(Uint8Array.from(atob(CREDENTIAL_ID), (c) => c.charCodeAt(0)))
		);
		expect(screen.queryByText(/enter your nsec/i)).toBeNull();
		expect(screen.queryAllByText(PASSKEY_APPROVE_MESSAGE)).toHaveLength(0);

		await waitFor(() => {
			expect(calls.publishProfileMetadata).toHaveBeenCalled();
			expect(nextStep).toHaveBeenCalledOnce();
		});
	});

	it('shows a validation error for a short description and does not open WebAuthn', async () => {
		const nextStep = vi.fn();
		render(ProfileSetup, { props: { displayName: 'Ada Lovelace', nextStep, prevStep: vi.fn() } });
		await fireEvent.input(screen.getByTestId('onboarding-profile-description'), {
			target: { value: 'Too short' }
		});
		await fireEvent.click(screen.getByTestId('onboarding-profile-next'));

		expect(screen.getByTestId('onboarding-profile-description')).toHaveClass('textarea-error');
		expect(credentialGet).not.toHaveBeenCalled();
		expect(calls.publishProfileMetadata).not.toHaveBeenCalled();
		expect(nextStep).not.toHaveBeenCalled();
		expect(screen.queryByText(/enter your nsec/i)).toBeNull();
		expect(screen.queryByText(PASSKEY_APPROVE_MESSAGE)).toBeNull();
	});

	it('skips recovery without a passkey prompt when the email is empty', async () => {
		const nextStep = vi.fn();
		render(RecoverySetup, { props: { nextStep, prevStep: vi.fn() } });
		await fireEvent.click(screen.getByTestId('onboarding-recovery-next'));
		expect(nextStep).toHaveBeenCalledOnce();
		expect(credentialGet).not.toHaveBeenCalled();
		expect(screen.queryByText(/enter your nsec/i)).toBeNull();
	});

	it('shows an email validation error and does not open WebAuthn', async () => {
		const nextStep = vi.fn();
		render(RecoverySetup, { props: { nextStep, prevStep: vi.fn() } });
		await fireEvent.input(screen.getByTestId('onboarding-recovery-email'), {
			target: { value: 'not-an-email' }
		});
		const form = screen.getByTestId('onboarding-recovery-email').closest('form');
		expect(form).toBeTruthy();
		await fireEvent.submit(form as HTMLFormElement);
		expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
		expect(credentialGet).not.toHaveBeenCalled();
		expect(nextStep).not.toHaveBeenCalled();
	});

	it('asks for the saved passkey when recovery is filled and the signer is missing', async () => {
		const nextStep = vi.fn();
		render(RecoverySetup, { props: { nextStep, prevStep: vi.fn() } });
		await waitFor(() => {
			expect(peekPasskeyChallenge()).toBeTruthy();
		});
		await fireEvent.input(screen.getByTestId('onboarding-recovery-email'), {
			target: { value: 'ada@example.com' }
		});
		await fireEvent.click(screen.getByTestId('onboarding-recovery-next'));

		await waitFor(() => {
			expect(credentialGet).toHaveBeenCalledTimes(1);
		});
		expect(screen.queryByText(/enter your nsec/i)).toBeNull();
		await waitFor(() => {
			expect(authService.setupRecovery).toHaveBeenCalled();
			expect(nextStep).toHaveBeenCalledOnce();
		});
	});

	it('starts tasking without a passkey prompt or an nsec ask', async () => {
		render(CompleteSetup);
		await fireEvent.click(screen.getByTestId('onboarding-go-to-dashboard'));
		expect(credentialGet).not.toHaveBeenCalled();
		expect(screen.queryByText(/enter your nsec/i)).toBeNull();
		expect(screen.queryByText(PASSKEY_APPROVE_MESSAGE)).toBeNull();
		await waitFor(() => {
			expect(goto).toHaveBeenCalledWith('/hiring');
		});
		expect(get(appStore).nostrKeys.nsec).toBeNull();
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/svelte';
import LoginPage from '../../../../routes/auth/login/+page.svelte';

vi.mock('$app/navigation', () => ({
	goto: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$app/paths', () => ({
	resolve: vi.fn((path: string) => path)
}));

const mockCheckBiometricAvailability = vi.fn();
const mockCheckWebBiometricAvailability = vi.fn();
const mockGetBiometricData = vi.fn();
const mockGetWebBiometricData = vi.fn();
vi.mock('$lib/utils/helpers/biometrics', () => ({
	checkBiometricAvailability: (...args: unknown[]) => mockCheckBiometricAvailability(...args),
	getBiometricData: (...args: unknown[]) => mockGetBiometricData(...args),
	setBiometricKey: vi.fn().mockResolvedValue({
		credentialId: '',
		passkeyPubkey: '',
		clientDataJSON: '',
		attestationObject: '',
		challenge: ''
	})
}));

vi.mock('$lib/utils/helpers/webBiometrics', () => ({
	checkWebBiometricAvailability: (...args: unknown[]) => mockCheckWebBiometricAvailability(...args),
	getWebBiometricData: (...args: unknown[]) => mockGetWebBiometricData(...args),
	setWebBiometricKey: vi.fn().mockResolvedValue({
		credentialId: '',
		passkeyPubkey: '',
		clientDataJSON: '',
		attestationObject: '',
		challenge: ''
	})
}));

vi.mock('$lib/utils/helpers/deviceIdentity', () => ({
	createUserDeviceShortName: vi.fn().mockResolvedValue('Device'),
	getDeviceIdentifier: vi.fn().mockResolvedValue('device-id-123')
}));

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		passkeyLogin: vi.fn().mockResolvedValue({
			access_token: 'token',
			user: {},
			encryptedData: {},
			isLegacy: false
		}),
		getChallenge: vi.fn().mockResolvedValue({ challenge: 'ch', message: 'msg' }),
		encryptedNostrData: vi.fn().mockResolvedValue({}),
		nostrLogin: vi
			.fn()
			.mockResolvedValue({ access_token: 'token', user: {}, isNewUser: false, isMigrated: false })
	}
}));

vi.mock('$lib/stores/auth.store', () => ({
	authState: {
		setupAuthData: vi.fn().mockResolvedValue(undefined),
		set: vi.fn(),
		setLoading: vi.fn(),
		setError: vi.fn(),
		login: vi.fn(),
		logout: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/utils/helpers/auth', () => ({
	decryptMasterKeyDataFromBiometrics: vi
		.fn()
		.mockResolvedValue({ nsec: 'nsec', mnemonic: 'mnemonic' }),
	encryptMasterKeyData: vi.fn().mockResolvedValue({ encryptedData: {}, exportedKey: 'key' })
}));

vi.mock('$lib/utils/helpers/biometricErrorHandler', () => ({
	handleBiometricError: vi.fn().mockResolvedValue('Error')
}));

vi.mock('@capacitor-core', () => ({
	Capacitor: { getPlatform: () => 'web' }
}));

vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
	BarcodeScanner: {
		isSupported: vi.fn().mockResolvedValue({ supported: true }),
		checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
		startScan: vi.fn().mockResolvedValue(undefined),
		stopScan: vi.fn().mockResolvedValue(undefined),
		addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
		removeAllListeners: vi.fn().mockResolvedValue(undefined),
		isTorchAvailable: vi.fn().mockResolvedValue({ available: false }),
		getMinZoomRatio: vi.fn().mockResolvedValue({ zoomRatio: 1 }),
		getMaxZoomRatio: vi.fn().mockResolvedValue({ zoomRatio: 10 })
	},
	BarcodeFormat: {
		QrCode: 'QR_CODE'
	},
	LensFacing: {
		Back: 'BACK'
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/utils/helpers/migratePasskey', () => ({
	default: vi.fn(),
	passkeyMigration: {
		subscribe: vi.fn((cb: (s: { state: string }) => void) => {
			cb({ state: 'migrated' });
			return vi.fn();
		}),
		update: vi.fn()
	},
	resetMigration: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	decodeNsec: vi.fn(() => new Uint8Array(32).fill(1))
}));

vi.mock('nostr-tools/pure', () => ({
	getPublicKey: vi.fn(() => 'a'.repeat(64)),
	finalizeEvent: vi.fn((ev: { kind: number; content: string; tags: string[][] }) => ({
		...ev,
		id: 'e',
		pubkey: 'p',
		created_at: Math.floor(Date.now() / 1000),
		sig: 's'
	}))
}));

vi.mock('nostr-tools/utils', () => ({
	bytesToHex: vi.fn(() => 'a'.repeat(64))
}));

describe('login flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockCheckBiometricAvailability.mockResolvedValue(true);
		mockCheckWebBiometricAvailability.mockResolvedValue(false);
		mockGetBiometricData.mockImplementation(
			() =>
				new Promise(() => {
					/* never resolve so first call stays in progress */
				})
		);
		mockGetWebBiometricData.mockImplementation(
			() =>
				new Promise(() => {
					/* never resolve */
				})
		);
	});

	describe('double-submit guard', () => {
		it('when passkey button is clicked twice quickly, getBiometricData is only called once', async () => {
			render(LoginPage);
			await waitFor(() => {
				const passkeyButton = document.querySelector('[data-testid="login-continue-passkey"]');
				expect(passkeyButton).toBeTruthy();
			});
			// Wait for onMount to set authMethods (biometric/webAuthn) so authenticate() calls getBiometricData
			await new Promise((r) => setTimeout(r, 50));
			const passkeyButton = document.querySelector('[data-testid="login-continue-passkey"]')!;

			fireEvent.click(passkeyButton);
			fireEvent.click(passkeyButton);

			await Promise.resolve();
			await Promise.resolve();

			expect(mockGetBiometricData).toHaveBeenCalledTimes(1);
		});
	});

	describe('nsec auth methods ready', () => {
		it('nsec submit button is disabled until auth methods have been checked', async () => {
			// Resolve auth checks after a delay so we can assert disabled state first
			mockCheckBiometricAvailability.mockImplementation(
				() => new Promise((r) => setTimeout(() => r(true), 80))
			);
			mockCheckWebBiometricAvailability.mockImplementation(
				() => new Promise((r) => setTimeout(() => r(false), 80))
			);

			render(LoginPage);
			// Switch to nsec form before onMount has finished
			const nsecToggle = screen.getByTestId('login-with-nsec');
			fireEvent.click(nsecToggle);

			const submitButton = screen.getByTestId('login-submit');
			expect(submitButton).toBeDisabled();

			await waitFor(
				() => {
					expect(submitButton).not.toBeDisabled();
				},
				{ timeout: 200 }
			);
		});
	});

	describe('nsec login error cause', () => {
		it('when nsec login fails with error that has a cause, displayed error includes cause message', async () => {
			const authService = (await import('$lib/api/services/auth.service')).default;
			vi.mocked(authService.getChallenge).mockResolvedValue({ challenge: 'ch', message: 'msg' });
			vi.mocked(authService.encryptedNostrData).mockResolvedValue({ encryptedData: null });
			vi.mocked(authService.nostrLogin).mockRejectedValueOnce(
				new Error('Decryption failed', { cause: new Error('Invalid key') })
			);

			render(LoginPage);
			await waitFor(() => {
				expect(screen.getByTestId('login-continue-passkey')).toBeTruthy();
			});
			await new Promise((r) => setTimeout(r, 50));

			fireEvent.click(screen.getByTestId('login-with-nsec'));
			await waitFor(() => {
				expect(screen.getByTestId('login-nsec-input')).toBeTruthy();
			});

			fireEvent.input(screen.getByTestId('login-nsec-input'), {
				target: { value: 'nsec1' + 'a'.repeat(56) }
			});
			fireEvent.click(screen.getByTestId('login-submit'));

			await waitFor(
				() => {
					expect(document.body.textContent).toContain('Invalid key');
				},
				{ timeout: 3000 }
			);
		});
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';
import { base64UrlToBase64, base64ToBytes } from '$lib/utils/helpers/encoding';

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		getChallenge: vi.fn().mockResolvedValue({ challenge: 'Y2hhbGxlbmdl' })
	}
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: 'npub1same' })
	}
}));

describe('getWebBiometricData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('when allowCredentialIds is provided, passes allowCredentials to navigator.credentials.get with decoded ids', async () => {
		// Credential ID in base64url (e.g. "YQ" = base64 for 0x61)
		const credIdBase64url = 'YQ';
		const decodedId = new Uint8Array(base64ToBytes(base64UrlToBase64(credIdBase64url))).buffer;

		let capturedOptions: PublicKeyCredentialRequestOptions | null = null;
		vi.stubGlobal(
			'navigator',
			Object.assign({}, navigator, {
				credentials: {
					get: vi.fn().mockImplementation((opts: { publicKey: PublicKeyCredentialRequestOptions }) => {
						capturedOptions = opts.publicKey;
						return Promise.resolve(null);
					})
				}
			})
		);

		vi.stubGlobal('PublicKeyCredential', {
			isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true)
		});

		await getWebBiometricData(false, [credIdBase64url]).catch(() => {});

		expect(capturedOptions).not.toBeNull();
		expect(capturedOptions!.allowCredentials).toBeDefined();
		expect(capturedOptions!.allowCredentials!.length).toBe(1);
		expect(capturedOptions!.allowCredentials![0].type).toBe('public-key');
		expect(new Uint8Array(capturedOptions!.allowCredentials![0].id)).toEqual(
			new Uint8Array(decodedId)
		);
	});

	it('when allowCredentialIds is empty or omitted, does not set allowCredentials (discovery)', async () => {
		let capturedOptions: PublicKeyCredentialRequestOptions | null = null;
		vi.stubGlobal(
			'navigator',
			Object.assign({}, navigator, {
				credentials: {
					get: vi.fn().mockImplementation((opts: { publicKey: PublicKeyCredentialRequestOptions }) => {
						capturedOptions = opts.publicKey;
						return Promise.resolve(null);
					})
				}
			})
		);

		vi.stubGlobal('PublicKeyCredential', {
			isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true)
		});

		await getWebBiometricData(false).catch(() => {});

		expect(capturedOptions).not.toBeNull();
		expect(capturedOptions!.allowCredentials).toBeUndefined();
	});
});

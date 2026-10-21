import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isNsecServerOutage, nsecLoginFailure } from '$lib/utils/helpers/nsec-login-error';

describe('nsec login errors', () => {
	it('replaces the raw WebAuthn requirement with a friendly key and no passkey modal', () => {
		expect(nsecLoginFailure('WebAuthn verification fields are required')).toEqual({
			textKey: 'login.errors.nsec_sign_in',
			passkeyModal: false
		});
	});

	it('replaces a rejected signature the same way', () => {
		expect(nsecLoginFailure('Invalid signature or unauthorized access')).toEqual({
			textKey: 'login.errors.nsec_sign_in',
			passkeyModal: false
		});
	});

	it('replaces an account-service 500 with service unavailable', () => {
		expect(nsecLoginFailure('Internal server error. Please try again later.')).toEqual({
			textKey: 'login.errors.service_unavailable',
			passkeyModal: false
		});
		expect(nsecLoginFailure('AUTH_SERVICE_UNAVAILABLE')).toEqual({
			textKey: 'login.errors.service_unavailable',
			passkeyModal: false
		});
		expect(isNsecServerOutage('AUTH_SERVICE_UNAVAILABLE')).toBe(true);
		expect(isNsecServerOutage('Internal server error. Please try again later.')).toBe(true);
		expect(isNsecServerOutage('No account associated with this Nostr key.')).toBe(false);
	});

	it('leaves an unrelated message alone', () => {
		expect(
			nsecLoginFailure('No account associated with this Nostr key. Please register first.')
		).toBe(null);
	});

	it('has English and Spanish copy for the friendly nsec error', () => {
		const en = JSON.parse(readFileSync('static/locales/en/auth.json', 'utf8')) as {
			login: { errors: { nsec_sign_in: string; service_unavailable: string } };
		};
		const es = JSON.parse(readFileSync('static/locales/es/auth.json', 'utf8')) as {
			login: { errors: { nsec_sign_in: string; service_unavailable: string } };
		};
		expect(en.login.errors.nsec_sign_in).toContain('Nostr key');
		expect(es.login.errors.nsec_sign_in).toContain('Nostr');
		expect(es.login.errors.nsec_sign_in).not.toBe(en.login.errors.nsec_sign_in);
		expect(en.login.errors.service_unavailable).toContain('Service unavailable');
		expect(es.login.errors.service_unavailable).toContain('Servicio no disponible');
		expect(es.login.errors.service_unavailable).not.toBe(en.login.errors.service_unavailable);
	});
});

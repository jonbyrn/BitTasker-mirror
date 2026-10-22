import { readFileSync } from 'node:fs';
import { generateSecretKey, nip19 } from 'nostr-tools';
import { describe, expect, it } from 'vitest';
import { ApiError } from '$lib/api/apiService';
import {
	NSEC_BECH32_LENGTH,
	NSEC_INVALID_MESSAGE_KEY,
	NSEC_NO_ACCOUNT_MESSAGE_KEY,
	NSEC_SIGN_IN_FAILED_MESSAGE_KEY,
	UNREGISTERED_NSEC_API_MESSAGE,
	isCompleteNsec,
	nsecApiErrorText,
	nsecLoginBlockReason
} from '$lib/utils/nostr/nsecFormat';

function validNsec(): string {
	return nip19.nsecEncode(generateSecretKey());
}

describe('nsec format', () => {
	it('accepts a complete nsec1 bech32 key of 63 characters', () => {
		const nsec = validNsec();
		expect(nsec.startsWith('nsec1')).toBe(true);
		expect(nsec).toHaveLength(NSEC_BECH32_LENGTH);
		expect(isCompleteNsec(`  ${nsec}  `)).toBe(true);
	});

	it('rejects a short, mistyped, or bad-checksum nsec before submit', () => {
		const nsec = validNsec();
		expect(isCompleteNsec(nsec.slice(0, 20))).toBe(false);
		expect(isCompleteNsec(`npub${nsec.slice(4)}`)).toBe(false);
		expect(isCompleteNsec(`${nsec.slice(0, -1)}b`)).toBe(false);
		expect(isCompleteNsec(`nsec1${'q'.repeat(58)}`)).toBe(false);
		expect(isCompleteNsec(null)).toBe(false);
		expect(isCompleteNsec(undefined)).toBe(false);
	});

	it('blocks an incomplete key even when the server would have returned 200', () => {
		expect(nsecLoginBlockReason('nsec1short', 200)).toEqual({
			key: NSEC_INVALID_MESSAGE_KEY,
			signup: false
		});
		expect(nsecLoginBlockReason(validNsec())).toBeNull();
		expect(nsecLoginBlockReason(validNsec(), null)).toBeNull();
	});

	it('treats the unregistered-key 400 as no account and other failures as generic', () => {
		const nsec = validNsec();
		const unknown = new ApiError(UNREGISTERED_NSEC_API_MESSAGE, 400, {
			message: UNREGISTERED_NSEC_API_MESSAGE
		});
		expect(nsecApiErrorText(unknown)).toContain(UNREGISTERED_NSEC_API_MESSAGE);
		expect(nsecLoginBlockReason(nsec, 400, nsecApiErrorText(unknown))).toEqual({
			key: NSEC_NO_ACCOUNT_MESSAGE_KEY,
			signup: true
		});
		expect(nsecLoginBlockReason(nsec, 400, 'USER NOT FOUND WITH THIS PUBLIC KEY')).toEqual({
			key: NSEC_NO_ACCOUNT_MESSAGE_KEY,
			signup: true
		});
		expect(nsecLoginBlockReason(nsec, 400, 'bad request')).toEqual({
			key: NSEC_SIGN_IN_FAILED_MESSAGE_KEY,
			signup: false
		});
		expect(nsecLoginBlockReason(nsec, 500, UNREGISTERED_NSEC_API_MESSAGE)).toEqual({
			key: NSEC_SIGN_IN_FAILED_MESSAGE_KEY,
			signup: false
		});
		expect(nsecLoginBlockReason(nsec, 0)).toEqual({
			key: NSEC_SIGN_IN_FAILED_MESSAGE_KEY,
			signup: false
		});
		expect(nsecLoginBlockReason('nsec1short', 400, UNREGISTERED_NSEC_API_MESSAGE)).toEqual({
			key: NSEC_INVALID_MESSAGE_KEY,
			signup: false
		});
		expect(nsecLoginBlockReason(nsec, 200)).toBeNull();
		expect(nsecLoginBlockReason(nsec, 204)).toBeNull();
	});

	it('ships the English and Spanish messages and a signup link', () => {
		const en = JSON.parse(readFileSync('static/locales/en/auth.json', 'utf8'));
		const es = JSON.parse(readFileSync('static/locales/es/auth.json', 'utf8'));
		expect(en.login.errors.invalid_or_incomplete_nsec).toBe('Invalid or incomplete nsec');
		expect(
			en.login.errors.nsec_no_account_before +
				en.login.errors.nsec_no_account_link +
				en.login.errors.nsec_no_account_after
		).toBe('No BitTasker account for this key. Create one or use another login.');
		expect(en.login.errors.nsec_no_account).toBe(
			'No BitTasker account for this key. Create one or use another login.'
		);
		expect(en.login.errors.nsec_sign_in_failed).toBe(
			'Could not sign in with this nsec. Please try again.'
		);
		expect(es.login.errors.invalid_or_incomplete_nsec).toBe('nsec inválido o incompleto');
		expect(
			es.login.errors.nsec_no_account_before +
				es.login.errors.nsec_no_account_link +
				es.login.errors.nsec_no_account_after
		).toBe(
			'No hay cuenta de BitTasker para esta clave. Crea una o usa otro método de inicio de sesión.'
		);
		expect(es.login.errors.nsec_no_account).toBe(
			'No hay cuenta de BitTasker para esta clave. Crea una o usa otro método de inicio de sesión.'
		);
		expect(es.login.errors.nsec_sign_in_failed).toBe(
			'No se pudo iniciar sesión con este nsec. Inténtalo de nuevo.'
		);

		const login = readFileSync('src/routes/(app)/auth/login/+page.svelte', 'utf8');
		expect(login).toContain('href="/auth/signup"');
		expect(login).toContain('data-testid="nsec-signup-link"');
	});

	it('does not swallow a 400 from encrypted-data login', () => {
		const auth = readFileSync('src/lib/api/services/auth.service.ts', 'utf8');
		const method = auth.slice(
			auth.indexOf('async encryptedNostrData'),
			auth.indexOf('async getPasskeyEncryptedData')
		);
		expect(method).toContain('return response.data');
		expect(method).not.toMatch(/catch\s*\(/);

		const login = readFileSync('src/routes/(app)/auth/login/+page.svelte', 'utf8');
		expect(login).toContain('nsecLoginBlockReason(nsec)');
		expect(login).toContain(
			'nsecLoginBlockReason(nsec, status || 400, nsecApiErrorText(requestError))'
		);
	});
});

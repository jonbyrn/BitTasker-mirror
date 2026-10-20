import { describe, expect, it } from 'vitest';
import { shouldClearSessionOnAuthFailure } from '$lib/utils/auth/session-auth';
import { readTokenFromPreferenceAndStorage } from '$lib/utils/auth/session-persistence';

describe('session auth failure', () => {
	it('keeps the session on network errors and opted-out requests', () => {
		expect(shouldClearSessionOnAuthFailure(undefined, false)).toBe(false);
		expect(shouldClearSessionOnAuthFailure(401, true)).toBe(false);
		expect(shouldClearSessionOnAuthFailure(500, false)).toBe(false);
	});

	it('clears the session on a confirmed 401 or 403', () => {
		expect(shouldClearSessionOnAuthFailure(401, false)).toBe(true);
		expect(shouldClearSessionOnAuthFailure(403, false)).toBe(true);
	});
});

describe('persisted access token', () => {
	it('prefers Preferences, then Capacitor web storage, then localStorage', () => {
		const storage = {
			getItem(key: string) {
				if (key === 'CapacitorStorage.access_token') return 'cap-token';
				if (key === 'access_token') return 'plain-token';
				return null;
			}
		};
		expect(readTokenFromPreferenceAndStorage('pref-token', storage)).toBe('pref-token');
		expect(readTokenFromPreferenceAndStorage('  ', storage)).toBe('cap-token');
		expect(
			readTokenFromPreferenceAndStorage(null, {
				getItem(key: string) {
					return key === 'access_token' ? 'plain-token' : null;
				}
			})
		).toBe('plain-token');
		expect(readTokenFromPreferenceAndStorage(null, null)).toBeNull();
	});
});

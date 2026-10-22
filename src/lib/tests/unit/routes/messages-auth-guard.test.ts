import { isRedirect } from '@sveltejs/kit';
import { Preferences } from '@capacitor/preferences';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authState } from '$lib/stores/auth.store';
import { beginSessionEnd, endSessionEnd } from '$lib/stores/session-ending';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));

import { load } from '../../../../routes/(app)/(protected)/+layout';

describe('protected route auth guard', () => {
	beforeEach(() => {
		endSessionEnd();
		vi.mocked(Preferences.get).mockResolvedValue({ value: null });
		vi.mocked(authState.login).mockClear();
	});

	it('sends a logged-out /messages visit to login with returnTo', async () => {
		const url = new URL('http://localhost/messages');
		try {
			await load({ url } as Parameters<typeof load>[0]);
			expect.fail('logged-out /messages should redirect');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) return;
			expect(error.status).toBe(303);
			const location = new URL(error.location, 'http://localhost');
			expect(location.pathname).toBe('/auth/login');
			expect(location.searchParams.get('returnTo')).toBe('/messages');
		}
		expect(authState.login).not.toHaveBeenCalled();
	});

	it('does not sign a protected page back in while logout is ending', async () => {
		beginSessionEnd();
		vi.mocked(Preferences.get).mockResolvedValue({ value: 'restored-token' });
		const url = new URL('http://localhost/messages');
		try {
			await load({ url } as Parameters<typeof load>[0]);
			expect.fail('logout must not keep the protected page');
		} catch (error) {
			expect(isRedirect(error)).toBe(true);
			if (!isRedirect(error)) return;
			expect(error.status).toBe(303);
			expect(new URL(error.location, 'http://localhost').pathname).toBe('/auth/login');
		}
		expect(authState.login).not.toHaveBeenCalled();
	});

	it('keeps a stored session on the protected page', async () => {
		vi.mocked(Preferences.get).mockResolvedValue({ value: 'session-token' });
		await expect(
			load({ url: new URL('http://localhost/messages') } as Parameters<typeof load>[0])
		).resolves.toBeUndefined();
		expect(authState.login).toHaveBeenCalled();
	});
});

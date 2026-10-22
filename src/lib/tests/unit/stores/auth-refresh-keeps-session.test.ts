import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { waitFor } from '@testing-library/svelte';

vi.unmock('$lib/stores/auth.store');

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(async ({ key }: { key: string }) => {
			if (key === 'access_token') return { value: 'access-token' };
			return { value: null };
		}),
		set: vi.fn(async () => undefined),
		remove: vi.fn(async () => undefined),
		clear: vi.fn(async () => undefined),
		keys: vi.fn(async () => ({ keys: [] }))
	}
}));

import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';

describe('auth refresh during onboarding', () => {
	it('keeps the access token and the signed-in state when npub is not stored yet', async () => {
		await waitFor(() => {
			expect(get(authState).isLoading).toBe(false);
		});

		expect(get(authState).isAuthenticated).toBe(true);
		expect(Preferences.remove).not.toHaveBeenCalled();
	});
});

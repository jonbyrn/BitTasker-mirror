import { describe, expect, it, vi } from 'vitest';
import {
	CLIENT_PURGE_KEY,
	purgeStaleClient,
	type StaleClient
} from '$lib/utils/purge-stale-client';

function client(overrides: Partial<StaleClient> = {}): StaleClient & {
	reload: ReturnType<typeof vi.fn>;
	unregister: ReturnType<typeof vi.fn>;
	deleteCache: ReturnType<typeof vi.fn>;
} {
	const unregister = vi.fn().mockResolvedValue(true);
	const deleteCache = vi.fn().mockResolvedValue(true);
	const reload = vi.fn();
	const store = new Map<string, string>();
	return {
		sessionGet: (key) => store.get(key) ?? null,
		sessionSet: (key, value) => {
			store.set(key, value);
		},
		registrations: async () => [{ unregister }],
		hasController: () => true,
		cacheKeys: async () => ['app-shell'],
		deleteCache,
		reload,
		unregister,
		...overrides
	};
}

describe('purgeStaleClient', () => {
	it('reloads once when a service worker is controlling the page', async () => {
		const browser = client();

		await expect(purgeStaleClient(browser)).resolves.toBe('reloaded');
		expect(browser.unregister).toHaveBeenCalledOnce();
		expect(browser.deleteCache).toHaveBeenCalledWith('app-shell');
		expect(browser.reload).toHaveBeenCalledOnce();
		expect(browser.sessionGet(CLIENT_PURGE_KEY)).toBe('1');

		await expect(purgeStaleClient(browser)).resolves.toBe('skipped');
		expect(browser.reload).toHaveBeenCalledOnce();
	});

	it('clears caches without reloading when nothing is controlling the page', async () => {
		const browser = client({
			registrations: async () => [],
			hasController: () => false
		});

		await expect(purgeStaleClient(browser)).resolves.toBe('cleared');
		expect(browser.reload).not.toHaveBeenCalled();
		expect(browser.deleteCache).toHaveBeenCalledWith('app-shell');
	});
});

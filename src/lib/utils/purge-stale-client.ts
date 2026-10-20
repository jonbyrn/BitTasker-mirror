/**
 * Drop a service worker or Cache Storage entry that is still serving the
 * bundle which POSTed /api/v1/events. Runs once per purge key.
 */
export const CLIENT_PURGE_KEY = 'bt-client-purge-160';

export interface StaleClient {
	sessionGet(key: string): string | null;
	sessionSet(key: string, value: string): void;
	registrations(): Promise<Array<{ unregister(): Promise<boolean> }>>;
	hasController(): boolean;
	cacheKeys(): Promise<string[]>;
	deleteCache(key: string): Promise<boolean>;
	reload(): void;
}

export type PurgeResult = 'skipped' | 'cleared' | 'reloaded';

export async function purgeStaleClient(client: StaleClient): Promise<PurgeResult> {
	if (client.sessionGet(CLIENT_PURGE_KEY)) return 'skipped';
	// Set the key before any await so a second caller in this page cannot reload twice.
	client.sessionSet(CLIENT_PURGE_KEY, '1');

	const [registrations, cacheKeys] = await Promise.all([
		client.registrations().catch(() => []),
		client.cacheKeys().catch(() => [])
	]);
	const controlling = client.hasController();

	await Promise.all([
		...registrations.map((registration) => registration.unregister().catch(() => false)),
		...cacheKeys.map((key) => client.deleteCache(key).catch(() => false))
	]);

	if (controlling) {
		client.reload();
		return 'reloaded';
	}

	return 'cleared';
}

export function purgeStaleClientInBrowser(): Promise<PurgeResult> {
	if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
		return Promise.resolve('skipped');
	}

	return purgeStaleClient({
		sessionGet: (key) => sessionStorage.getItem(key),
		sessionSet: (key, value) => sessionStorage.setItem(key, value),
		registrations: () => navigator.serviceWorker.getRegistrations(),
		hasController: () => Boolean(navigator.serviceWorker.controller),
		cacheKeys: () => (typeof caches === 'undefined' ? Promise.resolve([]) : caches.keys()),
		deleteCache: (key) => caches.delete(key),
		reload: () => window.location.reload()
	});
}

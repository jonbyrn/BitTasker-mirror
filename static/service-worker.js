// Replacement for an older app-shell worker. It clears caches, unregisters, and reloads.
self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.map((key) => caches.delete(key)));
			await self.registration.unregister();
			const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
			await Promise.all(
				windows.map((client) => (client.navigate ? client.navigate(client.url) : Promise.resolve()))
			);
		})()
	);
});

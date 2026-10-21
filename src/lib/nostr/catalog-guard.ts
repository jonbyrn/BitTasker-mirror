/**
 * Production catalog hosts. relay1-dev and relay2-dev are a different pair
 * and stay allowed. The sandbox site (rgb.bittasker.com) must not read or
 * publish kind 31000 / 30402 on the production hosts.
 */
const PRODUCTION_CATALOG_HOSTS = new Set(['relay1.bittasker.com', 'relay2.bittasker.com']);

export function sandboxIsolatesCatalog(): boolean {
	return import.meta.env.VITE_CLIENT_HOSTNAME === 'rgb.bittasker.com';
}

export function relayHostname(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
}

export function isProductionCatalogRelay(url: string): boolean {
	return PRODUCTION_CATALOG_HOSTS.has(relayHostname(url));
}

/** On the sandbox build, drop relay1 and relay2. Other builds keep their list. */
export function withoutProductionCatalogRelays(urls: string[]): string[] {
	if (!sandboxIsolatesCatalog()) return urls;
	return urls.filter((url) => !isProductionCatalogRelay(url));
}

/**
 * Sandbox listing writes must land on a non-production relay.
 * An empty list means the only configured target was relay1 or relay2.
 */
export function assertSandboxCatalogWrites(urls: string[]): string[] {
	if (!sandboxIsolatesCatalog()) return urls;
	const safe = urls.filter((url) => !isProductionCatalogRelay(url));
	if (safe.length === 0) {
		throw new Error('Sandbox cannot publish listings to relay1 or relay2.bittasker.com.');
	}
	return safe;
}

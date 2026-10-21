/**
 * Production catalog hosts. The sandbox site (rgb.bittasker.com) must not
 * read or publish kind 31000 / 30402 on these, or on the dev pair.
 * Sandbox listings belong on wss://relay.bittasker.com.
 */
const PRODUCTION_CATALOG_HOSTS = new Set(['relay1.bittasker.com', 'relay2.bittasker.com']);

/** Hosts the sandbox build must not use for the task and service catalog. */
const SANDBOX_BLOCKED_CATALOG_HOSTS = new Set([
	'relay1.bittasker.com',
	'relay2.bittasker.com',
	'relay1-dev.bittasker.com',
	'relay2-dev.bittasker.com'
]);

/** The only catalog relay the sandbox build may write. */
export const SANDBOX_CATALOG_HOST = 'relay.bittasker.com';

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

/** On the sandbox build, drop production and dev catalog relays. Other builds keep their list. */
export function withoutProductionCatalogRelays(urls: string[]): string[] {
	if (!sandboxIsolatesCatalog()) return urls;
	return urls.filter((url) => !SANDBOX_BLOCKED_CATALOG_HOSTS.has(relayHostname(url)));
}

/**
 * Sandbox listing writes land only on the sandbox relay.
 * relay2-dev accepts a socket and then does not finish AUTH, so a publish there
 * waits until the client times out. relay1 and relay2 are production.
 */
export function assertSandboxCatalogWrites(urls: string[]): string[] {
	if (!sandboxIsolatesCatalog()) return urls;
	const safe = urls.filter((url) => relayHostname(url) === SANDBOX_CATALOG_HOST);
	if (safe.length === 0) {
		throw new Error('Sandbox cannot publish listings to relay1 or relay2.bittasker.com.');
	}
	return safe;
}

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sandbox catalog guard', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('leaves production relays in place off the sandbox host', async () => {
		vi.stubEnv('VITE_CLIENT_HOSTNAME', 'bittasker.com');
		const { withoutProductionCatalogRelays, assertSandboxCatalogWrites } = await import(
			'$lib/nostr/catalog-guard'
		);
		const urls = ['wss://relay2.bittasker.com', 'wss://relay1.bittasker.com'];
		expect(withoutProductionCatalogRelays(urls)).toEqual(urls);
		expect(assertSandboxCatalogWrites(urls)).toEqual(urls);
	});

	it('drops relay1 and relay2 on the sandbox host and keeps the dev catalog', async () => {
		vi.stubEnv('VITE_CLIENT_HOSTNAME', 'rgb.bittasker.com');
		const { withoutProductionCatalogRelays, isProductionCatalogRelay } = await import(
			'$lib/nostr/catalog-guard'
		);
		expect(isProductionCatalogRelay('wss://relay2-dev.bittasker.com')).toBe(false);
		expect(isProductionCatalogRelay('wss://relay2.bittasker.com')).toBe(true);
		expect(
			withoutProductionCatalogRelays([
				'wss://relay1.bittasker.com',
				'wss://relay2.bittasker.com',
				'wss://relay2-dev.bittasker.com',
				'wss://nos.lol'
			])
		).toEqual(['wss://relay2-dev.bittasker.com', 'wss://nos.lol']);
	});

	it('refuses a sandbox listing write that only targets production', async () => {
		vi.stubEnv('VITE_CLIENT_HOSTNAME', 'rgb.bittasker.com');
		const { assertSandboxCatalogWrites } = await import('$lib/nostr/catalog-guard');
		expect(() => assertSandboxCatalogWrites(['wss://relay2.bittasker.com'])).toThrow(
			/relay1 or relay2/
		);
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('task write relays', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('publishes tasks to the listing relay when one is configured', async () => {
		vi.stubEnv('VITE_NOSTR_LISTING_RELAY_URL', 'wss://relay2.bittasker.com');
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		const { taskWriteRelays } = await import('$lib/nostr/task');
		expect(taskWriteRelays()).toEqual(['wss://relay2.bittasker.com']);
	});

	it('falls back to the general relay when the listing relay is unset', async () => {
		vi.stubEnv('VITE_NOSTR_LISTING_RELAY_URL', '');
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		const { taskWriteRelays } = await import('$lib/nostr/task');
		expect(taskWriteRelays()).toEqual(['wss://nos.lol']);
	});

	it('writes sandbox listings only to the sandbox relay and reads relay2 as well', async () => {
		vi.stubEnv('VITE_CLIENT_HOSTNAME', 'rgb.bittasker.com');
		vi.stubEnv('VITE_NOSTR_LISTING_RELAY_URL', 'wss://relay.bittasker.com');
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		const { taskWriteRelays } = await import('$lib/nostr/task');
		const { listingRelayUrls } = await import('$lib/nostr/listing-relays');
		expect(listingRelayUrls()).toEqual(['wss://relay.bittasker.com', 'wss://relay2.bittasker.com']);
		expect(taskWriteRelays()).toEqual(['wss://relay.bittasker.com']);
	});

	it('does not write sandbox listings to the dev relay', async () => {
		vi.stubEnv('VITE_CLIENT_HOSTNAME', 'rgb.bittasker.com');
		vi.stubEnv('VITE_NOSTR_LISTING_RELAY_URL', 'wss://relay2-dev.bittasker.com');
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		const { taskWriteRelays } = await import('$lib/nostr/task');
		const { listingRelayUrls } = await import('$lib/nostr/listing-relays');
		expect(listingRelayUrls()).toEqual(['wss://relay.bittasker.com', 'wss://relay2.bittasker.com']);
		expect(taskWriteRelays()).toEqual(['wss://relay.bittasker.com']);
	});

	it('reads relay2 on the sandbox and still refuses to publish there', async () => {
		vi.stubEnv('VITE_CLIENT_HOSTNAME', 'rgb.bittasker.com');
		vi.stubEnv(
			'VITE_NOSTR_LISTING_RELAY_URL',
			'wss://relay2.bittasker.com,wss://relay1.bittasker.com'
		);
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://nos.lol');
		const { taskWriteRelays } = await import('$lib/nostr/task');
		const { listingRelayUrls } = await import('$lib/nostr/listing-relays');
		expect(listingRelayUrls()).toEqual(['wss://relay.bittasker.com', 'wss://relay2.bittasker.com']);
		expect(taskWriteRelays()).toEqual(['wss://relay.bittasker.com']);
	});
});

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
});

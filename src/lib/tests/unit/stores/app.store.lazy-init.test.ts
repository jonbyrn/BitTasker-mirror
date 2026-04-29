import { describe, it, expect, vi, afterEach } from 'vitest';

describe('appStore lazy pool initialization', () => {
	afterEach(() => {
		vi.resetModules();
		vi.doUnmock('nostr-tools');
	});

	it('does not construct SimplePool during module import', async () => {
		const querySync = vi.fn();
		const mockPool = {
			querySync,
			publish: vi.fn(),
			subscribe: vi.fn(),
			get: vi.fn(),
			close: vi.fn()
		};
		const simplePoolConstructor = vi.fn(() => mockPool);

		vi.doMock('nostr-tools', () => ({
			SimplePool: simplePoolConstructor
		}));

		const { get } = await import('svelte/store');
		const { appStore } = await import('$lib/stores/app.store');

		expect(simplePoolConstructor).not.toHaveBeenCalled();

		const state = get(appStore);
		expect(state.pool).toBeDefined();

		const initializedPool = appStore.initializePool();
		expect(simplePoolConstructor).toHaveBeenCalledTimes(1);
		expect(initializedPool).toBe(state.pool);

		await initializedPool.querySync(['wss://relay.test'], { kinds: [0] });
		expect(simplePoolConstructor).toHaveBeenCalledTimes(1);
		expect(querySync).toHaveBeenCalledWith(['wss://relay.test'], { kinds: [0] });
	});
});

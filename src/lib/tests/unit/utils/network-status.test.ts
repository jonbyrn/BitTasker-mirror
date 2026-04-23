import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('browserNetworkStatus', () => {
	function setNavigatorOnline(online: boolean) {
		Object.defineProperty(window.navigator, 'onLine', {
			value: online,
			configurable: true
		});
	}

	beforeEach(() => {
		vi.resetModules();
		setNavigatorOnline(true);
	});

	afterEach(() => {
		vi.doUnmock('$app/environment');
	});

	it(
		'tracks offline and reconnect transitions in the browser',
		async () => {
		vi.doMock('$app/environment', () => ({
			browser: true
		}));

		const { browserNetworkStatus } = await import('$lib/utils/network-status');
		const observed: Array<{ online: boolean; lastTransition: string }> = [];
		const unsubscribe = browserNetworkStatus.subscribe((value) => {
			observed.push(value);
		});

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));
		setNavigatorOnline(true);
		window.dispatchEvent(new Event('online'));

		unsubscribe();

			expect(observed).toEqual([
				{
					online: true,
					lastTransition: 'initial'
				},
				{
					online: false,
					lastTransition: 'offline'
				},
				{
					online: true,
					lastTransition: 'online'
				}
			]);
		},
		20_000
	);

	it('fails open outside the browser runtime', async () => {
		vi.doMock('$app/environment', () => ({
			browser: false
		}));

		const { browserNetworkStatus } = await import('$lib/utils/network-status');
		const observed: Array<{ online: boolean; lastTransition: string }> = [];
		const unsubscribe = browserNetworkStatus.subscribe((value) => {
			observed.push(value);
		});

		unsubscribe();

		expect(observed).toEqual([
			{
				online: true,
				lastTransition: 'initial'
			}
		]);
	});
});

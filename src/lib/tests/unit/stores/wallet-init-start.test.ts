import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { IDB_OPEN_MS } from '$lib/utils/helpers/indexed-db-open';
import { walletStore } from '$lib/stores/wallet/wallet-state';
import { initialState } from '$lib/stores/wallet/wallet-types';
import { initialize, WALLET_INIT_TIMEOUT } from '$lib/stores/wallet/wallet-init';

const CIPHER_KEY = 'bittasker.mnemonic.cipher';

function hangIndexedDb(): void {
	vi.stubGlobal('indexedDB', {
		open() {
			return {
				onsuccess: null,
				onerror: null,
				onblocked: null,
				onupgradeneeded: null
			};
		}
	});
}

describe('wallet init start', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		sessionStorage.clear();
		walletStore.set(structuredClone(initialState));
	});

	it('logs start and leaves Loading when the snapshot database never opens', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
		hangIndexedDb();
		const lines: string[] = [];
		const info = vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
			lines.push(args.map((arg) => String(arg)).join(' '));
		});
		const pending = initialize();
		await vi.advanceTimersByTimeAsync(IDB_OPEN_MS * 2 + 50);
		await pending;
		expect(lines.some((line) => line.includes('[wallet-init] start'))).toBe(true);
		expect(get(walletStore).isInitializing).toBe(false);
		expect(get(walletStore).locked).toBe(true);
		info.mockRestore();
	});

	it('shows a visible error when the session database never opens', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
		hangIndexedDb();
		sessionStorage.setItem(CIPHER_KEY, JSON.stringify({ iv: 'aa', data: 'bb', at: Date.now() }));
		const pending = initialize().then(
			() => null,
			(error: unknown) => error
		);
		await vi.advanceTimersByTimeAsync(IDB_OPEN_MS * 4 + 50);
		const error = await pending;
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(WALLET_INIT_TIMEOUT);
		expect(get(walletStore).isInitializing).toBe(false);
		expect(get(walletStore).error).toBe(WALLET_INIT_TIMEOUT);
	});
});

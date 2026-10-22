import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { IDB_OPEN_MS } from '$lib/utils/helpers/indexed-db-open';
import { walletStore } from '$lib/stores/wallet/wallet-state';
import { initialState } from '$lib/stores/wallet/wallet-types';
import {
	describeSessionOpenError,
	initialize,
	walletOpenFailure,
	WALLET_INIT_TIMEOUT
} from '$lib/stores/wallet/wallet-init';
import { WASM_CRASH_MESSAGE } from '$lib/stores/wallet/wasm-lock';

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

describe('wallet open failure', () => {
	it('keeps a normal open error so unlock can retry', () => {
		expect(walletOpenFailure(new Error('Wallet transport auth is missing'), false)).toEqual({
			message: 'Wallet transport auth is missing',
			retry: true
		});
	});

	it('retries a blocked session open instead of the generic setup line', () => {
		expect(describeSessionOpenError(new DOMException('', 'AbortError'))).toEqual({
			retry: true,
			message: WALLET_INIT_TIMEOUT
		});
		expect(describeSessionOpenError('blocked')).toEqual({
			retry: true,
			message: WALLET_INIT_TIMEOUT
		});
		expect(describeSessionOpenError(new Error('Wallet transport auth is missing')).retry).toBe(
			false
		);
	});

	it('asks for a reload only after a wasm panic', () => {
		expect(walletOpenFailure(new Error('unreachable'), false)).toEqual({
			message: WASM_CRASH_MESSAGE,
			retry: false
		});
		expect(walletOpenFailure(new Error('network'), true).retry).toBe(false);
	});
});

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
		await vi.advanceTimersByTimeAsync(IDB_OPEN_MS * 6 + 500);
		const error = await pending;
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(WALLET_INIT_TIMEOUT);
		expect(get(walletStore).isInitializing).toBe(false);
		expect(get(walletStore).error).toBe(WALLET_INIT_TIMEOUT);
	});
});

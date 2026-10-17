import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	IDB_OPEN_MS,
	IndexedDbTimeoutError,
	openIndexedDb
} from '$lib/utils/helpers/indexed-db-open';

interface FakeRequest {
	onsuccess: ((event: Event) => void) | null;
	onerror: ((event: Event) => void) | null;
	onblocked: ((event: Event) => void) | null;
	onupgradeneeded: ((event: Event) => void) | null;
	result?: IDBDatabase;
	error?: DOMException | null;
}

describe('indexedDB open timeout', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('rejects when open never completes', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('indexedDB', {
			open(): FakeRequest {
				return {
					onsuccess: null,
					onerror: null,
					onblocked: null,
					onupgradeneeded: null
				};
			}
		});
		const pending = openIndexedDb('bittasker-wallet-snapshot', 1).then(
			() => null,
			(error: unknown) => error
		);
		await vi.advanceTimersByTimeAsync(IDB_OPEN_MS);
		const error = await pending;
		expect(error).toBeInstanceOf(IndexedDbTimeoutError);
		expect((error as Error).message).toMatch(/timed out/);
	});

	it('rejects when another connection blocks the open', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('indexedDB', {
			open(): FakeRequest {
				const request: FakeRequest = {
					onsuccess: null,
					onerror: null,
					onblocked: null,
					onupgradeneeded: null
				};
				queueMicrotask(() => request.onblocked?.(new Event('blocked')));
				return request;
			}
		});
		const error = await openIndexedDb('bittasker-wallet-session', 1).then(
			() => null,
			(error: unknown) => error
		);
		expect(error).toBeInstanceOf(IndexedDbTimeoutError);
		expect((error as Error).message).toMatch(/blocked/);
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	WASM_CRASH_MESSAGE,
	isWasmPanic,
	lockedWallet,
	resetWasmLockForTests,
	walletReloadRequired,
	wasmCrashed,
	withWasm
} from '$lib/stores/wallet/wasm-lock';

afterEach(() => {
	resetWasmLockForTests();
});

describe('withWasm', () => {
	it('runs overlapping calls one at a time', async () => {
		const order: string[] = [];
		let release: (() => void) | undefined;
		const first = withWasm('first', () => {
			order.push('start-first');
			return new Promise<void>((resolve) => {
				release = () => {
					order.push('end-first');
					resolve();
				};
			});
		});
		const second = withWasm('second', async () => {
			order.push('second');
		});
		await Promise.resolve();
		expect(order).toEqual(['start-first']);
		release?.();
		await first;
		await second;
		expect(order).toEqual(['start-first', 'end-first', 'second']);
	});

	it('runs a nested call inline', async () => {
		const order: string[] = [];
		await withWasm('outer', async () => {
			order.push('outer');
			await withWasm('inner', async () => {
				order.push('inner');
			});
		});
		expect(order).toEqual(['outer', 'inner']);
	});

	it('rejects later calls after a borrow panic', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		await expect(
			withWasm('refresh', async () => {
				throw new Error(
					'panicked at ldk_live_backend.rs:1513:36 already mutably borrowed: BorrowError'
				);
			})
		).rejects.toThrow('already mutably borrowed');
		expect(wasmCrashed()).toBe(true);
		expect(isWasmPanic('RuntimeError: unreachable')).toBe(true);
		await expect(withWasm('listChannels', async () => 'nope')).rejects.toThrow(WASM_CRASH_MESSAGE);
		expect(walletReloadRequired(WASM_CRASH_MESSAGE)).toBe(true);
		warn.mockRestore();
	});
});

describe('lockedWallet', () => {
	it('queues async methods and keeps createLsp bound to the proxy', async () => {
		const order: string[] = [];
		let release: () => void = () => undefined;
		const wallet = lockedWallet({
			isOnline: () => false,
			refreshWallet() {
				order.push('refresh-start');
				return new Promise<void>((resolve) => {
					release = () => {
						order.push('refresh-end');
						resolve();
					};
				});
			},
			listChannels() {
				order.push('channels');
				return Promise.resolve();
			},
			createLsp(this: object) {
				return Promise.resolve(this);
			}
		});
		expect(wallet.isOnline()).toBe(false);
		const refreshing = wallet.refreshWallet();
		const listed = wallet.listChannels();
		await Promise.resolve();
		expect(order).toEqual(['refresh-start']);
		release();
		await refreshing;
		await listed;
		expect(order).toEqual(['refresh-start', 'refresh-end', 'channels']);
		await expect(wallet.createLsp()).resolves.toBe(wallet);
	});
});

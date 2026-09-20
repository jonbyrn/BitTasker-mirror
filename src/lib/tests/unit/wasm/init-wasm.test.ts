import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: true }));

describe('initWasm', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.unstubAllGlobals();
		window.__wasmReady = undefined;
		window.__wasmLive = undefined;
		delete window.initWasm;
	});

	afterEach(() => {
		delete window.__wasmReady;
		delete window.__wasmLive;
		delete window.initWasm;
		vi.unstubAllGlobals();
	});

	it('does not mark ready when wasm assets fail', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('wasm asset offline')));
		const { initWasm } = await import('$lib/wasm/init-wasm');
		await expect(initWasm()).rejects.toThrow('wasm asset offline');
		expect(window.__wasmReady).toBe(false);
		expect(window.__wasmLive).toBe(false);
	});

	it('marks ready after wasm assets and bitcoinjs are available', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
		const { initWasm } = await import('$lib/wasm/init-wasm');
		await expect(initWasm()).resolves.toBe(true);
		expect(window.__wasmReady).toBe(true);
		expect(window.__wasmLive).toBe(true);
	});

	it('exposes initWasm on window', async () => {
		const { exposeInitWasm, initWasm } = await import('$lib/wasm/init-wasm');
		exposeInitWasm();
		expect(window.initWasm).toBe(initWasm);
		expect(window.__wasmReady).toBe(false);
		expect(window.__wasmLive).toBe(false);
	});
});

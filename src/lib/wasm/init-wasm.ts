import { browser } from '$app/environment';
import * as bitcoinjs from '$lib/shims/bitcoinjs-lib';

const WASM_ASSETS = ['/wasm/rln_wasm_sdk_bg.wasm', '/wasm/rgb_lib_wasm_bindings_bg.wasm'] as const;
const WASM_INIT_MS = 60_000;

type WasmWindow = Window & {
	initWasm?: () => Promise<boolean>;
	__wasmReady?: boolean;
	__wasmLive?: boolean;
};

let wasmInitPromise: Promise<boolean> | null = null;

function wasmWindow(): WasmWindow {
	return window as WasmWindow;
}

function markWasmReady(ready: boolean, live: boolean): void {
	if (!browser || typeof window === 'undefined') return;
	const target = wasmWindow();
	target.__wasmReady = ready;
	target.__wasmLive = live;
}

async function ensureWasmAssets(): Promise<void> {
	if (!browser || typeof fetch !== 'function') return;

	for (const asset of WASM_ASSETS) {
		let response: Response;
		try {
			response = await fetch(asset, { method: 'HEAD' });
		} catch {
			response = await fetch(asset);
		}
		if (!response.ok) {
			response = await fetch(asset);
		}
		if (!response.ok) {
			throw new Error(`RGB WASM asset unavailable: ${asset} (HTTP ${response.status})`);
		}
	}
}

/**
 * Checks RGB/Bitcoin Wasm assets and bitcoinjs before wallet or escrow signing.
 * Does not import `@utexo/rgb-sdk-web` — that must wait until URL patches apply.
 */
export async function initWasm(): Promise<boolean> {
	if (!browser) return false;
	if (wasmInitPromise) return wasmInitPromise;

	wasmInitPromise = (async () => {
		try {
			await Promise.race([
				(async () => {
					await ensureWasmAssets();
					if (typeof bitcoinjs.Psbt !== 'function') {
						throw new Error('bitcoinjs-lib shim loaded without Psbt');
					}
				})(),
				new Promise<never>((_, reject) => {
					setTimeout(() => reject(new Error('initWasm timed out')), WASM_INIT_MS);
				})
			]);
			markWasmReady(true, true);
			return true;
		} catch (error) {
			wasmInitPromise = null;
			markWasmReady(false, false);
			throw error;
		}
	})();

	return wasmInitPromise;
}

export function exposeInitWasm(): void {
	if (!browser || typeof window === 'undefined') return;
	const target = wasmWindow();
	target.initWasm = initWasm;
	if (typeof target.__wasmReady !== 'boolean') {
		target.__wasmReady = false;
	}
	if (typeof target.__wasmLive !== 'boolean') {
		target.__wasmLive = false;
	}
}

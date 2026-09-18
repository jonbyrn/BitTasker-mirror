import { browser } from '$app/environment';

const WASM_ASSETS = ['/wasm/rln_wasm_sdk_bg.wasm', '/wasm/rgb_lib_wasm_bindings_bg.wasm'] as const;
const WASM_INIT_MS = 60_000;

type WasmWindow = Window & {
	initWasm?: () => Promise<boolean>;
	__wasmReady?: boolean;
	__wasmLive?: boolean;
};

type RgbSdkWeb = {
	UTEXOWallet?: unknown;
	initRlnWasm?: () => Promise<unknown>;
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

function assertLiveSdk(rgbSdk: RgbSdkWeb): void {
	if (!rgbSdk.UTEXOWallet && typeof rgbSdk.initRlnWasm !== 'function') {
		throw new Error('RGB SDK loaded without UTEXOWallet or initRlnWasm');
	}
}

/**
 * Loads RGB/Bitcoin Wasm bindings before wallet, contract, or escrow signing.
 * Ready is only set after the live `@utexo/rgb-sdk-web` module imports.
 */
export async function initWasm(): Promise<boolean> {
	if (!browser) return false;
	if (wasmInitPromise) return wasmInitPromise;

	wasmInitPromise = (async () => {
		try {
			await Promise.race([
				(async () => {
					await ensureWasmAssets();
					const rgbSdk = (await import('@utexo/rgb-sdk-web')) as RgbSdkWeb;
					assertLiveSdk(rgbSdk);
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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(import.meta.dirname, '../../../../../');

describe('bitcoinjs Buffer startup', () => {
	it('imports the polyfill before the eager bitcoinjs-lib graph', () => {
		const hooks = readFileSync(resolve(projectRoot, 'src/hooks.client.ts'), 'utf8');
		const shim = readFileSync(resolve(projectRoot, 'src/lib/shims/bitcoinjs-lib.ts'), 'utf8');
		const initWasm = readFileSync(resolve(projectRoot, 'src/lib/wasm/init-wasm.ts'), 'utf8');
		const viteConfig = readFileSync(resolve(projectRoot, 'vite.config.ts'), 'utf8');

		expect(hooks.indexOf("import '$lib/polyfills'")).toBeGreaterThanOrEqual(0);
		expect(hooks.indexOf("import '$lib/polyfills'")).toBeLessThan(hooks.indexOf('exposeInitWasm'));
		expect(shim.indexOf("import '$lib/polyfills'")).toBeLessThan(
			shim.indexOf("from 'bitcoinjs-lib'")
		);
		expect(initWasm.indexOf("import '$lib/polyfills'")).toBeLessThan(
			initWasm.indexOf("from '$lib/shims/bitcoinjs-lib'")
		);
		expect(viteConfig).toContain('src/lib/shims/buffer-inject.js');
	});
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assertRlnPin, copyPinnedWasm, RLN_WASM_PIN } from '../../scripts/pin-rln-wasm.mjs';

test('accepts only the pinned rln-wasm release', () => {
	assert.doesNotThrow(() => assertRlnPin(RLN_WASM_PIN));
	assert.throws(
		() => assertRlnPin('0.13.0-beta.3'),
		new RegExp(RLN_WASM_PIN.replaceAll('.', '\\.'))
	);
	assert.throws(() => assertRlnPin(undefined), /unknown/);
});

test('copies the pinned wasm and refuses a different package', async (t) => {
	const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pin-rln-wasm-'));
	t.after(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	const packageRoot = path.join(tempDir, 'package');
	const dest = path.join(tempDir, 'build', 'rln_wasm_sdk_bg.wasm');
	await fs.promises.mkdir(packageRoot);
	await fs.promises.writeFile(
		path.join(packageRoot, 'package.json'),
		JSON.stringify({ version: RLN_WASM_PIN })
	);
	await fs.promises.writeFile(path.join(packageRoot, 'rln_wasm_sdk_bg.wasm'), 'pinned-wasm');

	assert.equal(copyPinnedWasm(packageRoot, dest), dest);
	assert.equal(await fs.promises.readFile(dest, 'utf8'), 'pinned-wasm');

	await fs.promises.writeFile(
		path.join(packageRoot, 'package.json'),
		JSON.stringify({ version: '0.13.0-beta.3' })
	);
	assert.throws(() => copyPinnedWasm(packageRoot, dest), /0\.13\.0-beta\.3/);
});

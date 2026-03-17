import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ensurePreviewManifest } from '../../scripts/fix-sveltekit-preview-manifest.mjs';

test('creates manifest.js shim from manifest-full.js when needed', async (t) => {
	const tempDir = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), 'preview-manifest-shim-')
	);
	const serverDir = path.join(tempDir, 'server');
	await fs.promises.mkdir(serverDir, { recursive: true });
	await fs.promises.writeFile(
		path.join(serverDir, 'manifest-full.js'),
		'export const manifest = { ok: true };\n',
		'utf8'
	);

	t.after(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	const result = ensurePreviewManifest(serverDir);

	assert.equal(result.changed, true);
	assert.equal(result.reason, 'shim-created');
	assert.match(
		await fs.promises.readFile(path.join(serverDir, 'manifest.js'), 'utf8'),
		/export \{ manifest \} from '\.\/manifest-full\.js';/
	);
});

test('keeps an existing manifest.js untouched', async (t) => {
	const tempDir = await fs.promises.mkdtemp(
		path.join(os.tmpdir(), 'preview-manifest-existing-')
	);
	const serverDir = path.join(tempDir, 'server');
	await fs.promises.mkdir(serverDir, { recursive: true });
	await fs.promises.writeFile(
		path.join(serverDir, 'manifest.js'),
		'export const manifest = { existing: true };\n',
		'utf8'
	);
	await fs.promises.writeFile(
		path.join(serverDir, 'manifest-full.js'),
		'export const manifest = { replacement: true };\n',
		'utf8'
	);

	t.after(async () => {
		await fs.promises.rm(tempDir, { recursive: true, force: true });
	});

	const result = ensurePreviewManifest(serverDir);

	assert.equal(result.changed, false);
	assert.equal(result.reason, 'manifest-present');
	assert.match(
		await fs.promises.readFile(path.join(serverDir, 'manifest.js'), 'utf8'),
		/existing: true/
	);
});

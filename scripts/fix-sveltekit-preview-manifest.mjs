#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultServerDir = path.resolve(scriptDir, '../.svelte-kit/output/server');

export function ensurePreviewManifest(serverDir = defaultServerDir) {
	const manifestPath = path.join(serverDir, 'manifest.js');
	const manifestFullPath = path.join(serverDir, 'manifest-full.js');

	if (fs.existsSync(manifestPath)) {
		return { changed: false, reason: 'manifest-present', manifestPath };
	}

	if (!fs.existsSync(manifestFullPath)) {
		throw new Error(
			`Cannot create preview manifest shim because ${manifestFullPath} does not exist.`
		);
	}

	fs.writeFileSync(
		manifestPath,
		"export { manifest } from './manifest-full.js';\n",
		'utf8'
	);

	return { changed: true, reason: 'shim-created', manifestPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const result = ensurePreviewManifest();
	console.log(
		result.changed
			? `Created preview manifest shim at ${result.manifestPath}`
			: `Preview manifest already present at ${result.manifestPath}`
	);
}

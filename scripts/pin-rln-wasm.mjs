#!/usr/bin/env node

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Installed glue must match static/wasm and the package pin. */
export const RLN_WASM_PIN = '0.17.0-beta.3';

export function assertRlnPin(version) {
	if (version !== RLN_WASM_PIN) {
		throw new Error(
			`@utexo/rln-wasm ${version ?? 'unknown'} is installed; wallet builds require ${RLN_WASM_PIN}.`
		);
	}
}

/** Copy the pinned package wasm over the adapter output so static/ cannot replace it. */
export function copyPinnedWasm(packageRoot, destPath) {
	const pkg = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
	assertRlnPin(pkg.version);
	mkdirSync(path.dirname(destPath), { recursive: true });
	copyFileSync(path.join(packageRoot, 'rln_wasm_sdk_bg.wasm'), destPath);
	return destPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
	const packageRoot = path.dirname(
		createRequire(import.meta.url).resolve('@utexo/rln-wasm/package.json')
	);
	const dest = copyPinnedWasm(
		packageRoot,
		path.resolve(projectRoot, 'build/wasm/rln_wasm_sdk_bg.wasm')
	);
	console.log(`Pinned rln wasm ${RLN_WASM_PIN} at ${dest}`);
}

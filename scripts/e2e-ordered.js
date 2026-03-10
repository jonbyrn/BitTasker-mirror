#!/usr/bin/env node

/**
 * E2E ordered test run: credentials phase first (single worker), then the rest.
 *
 * Usage:
 *   npm run test:e2e [-- playwright-args...]
 *   npm run test:e2e:ui   # opens Playwright UI (single run, all specs in order)
 *   npm run test:e2e:runtime-passkey  # runs only @runtime-passkey tests on chromium
 *
 * Phases (when not using --ui):
 *   1. Run 01-signup-onboarding.spec.ts with --workers=1 (creates credentials file).
 *   2. Run all other specs under tests/e2e/ with workers=1 in CI or 4 locally.
 *
 * Tag split:
 *   - Default run excludes @runtime-passkey tests.
 *   - Runtime passkey mode includes only @runtime-passkey tests.
 *
 * With --ui: runs once with all specs in order and --workers=1 so "Run all" in the UI
 * respects the same order. Pass other args after -- (e.g. npm run test:e2e -- --ui --grep dashboard-home).
 * See docs/testing/e2e-testing.md for env vars (VITE_API_URL, etc.).
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const E2E_DIR = 'tests/e2e';
const CREDENTIALS_SPEC = '01-signup-onboarding.spec.ts';
const RUNTIME_PASSKEY_TAG = '@runtime-passkey';

const isCI = !!process.env.CI;
const phase2Workers = isCI ? 1 : 4;

/** Collect all .spec.ts paths under dir, relative to cwd. */
function listSpecFiles(dir) {
	const cwd = process.cwd();
	const results = [];

	function walk(d) {
		const entries = fs.readdirSync(path.join(cwd, d), { withFileTypes: true });
		for (const e of entries) {
			const rel = path.join(d, e.name);
			if (e.isDirectory()) {
				walk(rel);
			} else if (e.name.endsWith('.spec.ts')) {
				results.push(rel);
			}
		}
	}

	walk(dir);
	return results;
}

/** Phase definitions: each is { label, args }. args are passed to: npx playwright test ...args */
function buildOrderedPhases(extraArgs, defaultFilterArgs) {
	const base = ['--project=chromium', ...defaultFilterArgs, ...extraArgs];
	const allSpecs = listSpecFiles(E2E_DIR);
	const restSpecs = allSpecs.filter((f) => !f.includes(CREDENTIALS_SPEC));

	const phases = [
		{
			label: 'Credentials (01-signup-onboarding)',
			args: [path.join(E2E_DIR, CREDENTIALS_SPEC).replace(/\\/g, '/'), '--workers=1', ...base]
		}
	];
	if (restSpecs.length > 0) {
		phases.push({
			label: 'Rest of E2E',
			args: [...restSpecs.map((f) => f.replace(/\\/g, '/')), `--workers=${phase2Workers}`, ...base]
		});
	}
	return phases;
}

function buildRuntimePasskeyPhase(extraArgs) {
	const allSpecs = listSpecFiles(E2E_DIR);
	return {
		label: `Runtime passkey (${RUNTIME_PASSKEY_TAG})`,
		args: [
			...allSpecs,
			'--workers=1',
			'--project=chromium',
			'--grep',
			RUNTIME_PASSKEY_TAG,
			'--pass-with-no-tests',
			...extraArgs
		]
	};
}

function printHelp() {
	console.log(`
Usage:
  npm run test:e2e [-- playwright-args...]
  npm run test:e2e -- --ui
  npm run test:e2e -- --runtime-passkey
  npm run test:e2e -- --runtime-passkey --ui

Custom flags:
  --runtime-passkey         Run only tests tagged with ${RUNTIME_PASSKEY_TAG} (chromium, workers=1).
  --include-runtime-passkey Include ${RUNTIME_PASSKEY_TAG} tests in the default ordered run.
  --dry-run                 Print playwright commands without executing them.
  -h, --help                Show this help.
`);
}

function runPlaywright(args, dryRun = false) {
	return new Promise((resolve, reject) => {
		const cmd = 'npx';
		const fullArgs = ['playwright', 'test', ...args];
		console.log(`\n→ ${cmd} ${fullArgs.join(' ')}\n`);
		if (dryRun) {
			resolve();
			return;
		}

		// Strip CI from the child env so playwright.config.ts uses the dev server (port 3000).
		// The backend only allows localhost:3000, not the preview server port (4173).
		// CI/CD pipelines that call `npx playwright test` directly are unaffected.
		const { CI: _, ...childEnv } = process.env;
		const proc = spawn(cmd, fullArgs, {
			stdio: 'inherit',
			shell: true,
			env: childEnv
		});

		proc.on('close', (code) => {
			if (code !== 0) reject(new Error(`Playwright exited ${code}`));
			else resolve();
		});
		proc.on('error', reject);
	});
}

async function main() {
	console.log(
		'Ensure VITE_API_URL is set in .env and points to a live backend for tests to run.\n'
	);
	const rawArgs = process.argv.slice(2).filter((a) => a !== '--');
	if (rawArgs.includes('-h') || rawArgs.includes('--help')) {
		printHelp();
		return;
	}

	const uiMode = rawArgs.includes('--ui');
	const runtimePasskeyMode = rawArgs.includes('--runtime-passkey');
	const includeRuntimePasskey = rawArgs.includes('--include-runtime-passkey');
	const dryRun = rawArgs.includes('--dry-run');
	const extraArgs = rawArgs.filter(
		(a) =>
			a !== '--ui' &&
			a !== '--runtime-passkey' &&
			a !== '--include-runtime-passkey' &&
			a !== '--dry-run'
	);
	const defaultFilterArgs =
		runtimePasskeyMode || includeRuntimePasskey ? [] : ['--grep-invert', RUNTIME_PASSKEY_TAG];

	if (runtimePasskeyMode) {
		const runtimePhase = buildRuntimePasskeyPhase(extraArgs);
		if (uiMode) {
			console.log(`\n→ E2E UI mode: runtime passkey tests only (${RUNTIME_PASSKEY_TAG})\n`);
			await runPlaywright([...runtimePhase.args, '--ui'], dryRun);
			console.log('\n✓ E2E runtime passkey UI run finished\n');
			return;
		}

		console.log(`\n═══════════════════════════════════════`);
		console.log(`   ${runtimePhase.label}`);
		console.log(`═══════════════════════════════════════`);
		await runPlaywright(runtimePhase.args, dryRun);
		console.log('\n✓ E2E runtime passkey run finished\n');
		return;
	}

	if (uiMode) {
		const allSpecs = listSpecFiles(E2E_DIR).map((f) => f.replace(/\\/g, '/'));
		const args = [
			...allSpecs,
			'--workers=1',
			'--project=chromium',
			...defaultFilterArgs,
			'--ui',
			...extraArgs
		];
		console.log(
			`\n→ E2E UI mode: all specs in order (default excludes ${RUNTIME_PASSKEY_TAG}; run 01 first for credentials)\n`
		);
		await runPlaywright(args, dryRun);
		console.log('\n✓ E2E UI run finished\n');
		return;
	}

	const phases = buildOrderedPhases(extraArgs, defaultFilterArgs);

	for (const phase of phases) {
		console.log(`\n═══════════════════════════════════════`);
		console.log(`   ${phase.label}`);
		console.log(`═══════════════════════════════════════`);
		await runPlaywright(phase.args, dryRun);
	}

	console.log('\n✓ E2E run finished\n');
}

main().catch((err) => {
	console.error('\n✗ E2E run failed:', err.message);
	process.exit(1);
});

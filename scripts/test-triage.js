#!/usr/bin/env node

/**
 * Test Triage Script
 *
 * Runs Vitest once for all tests with JSON reporter, then groups results by directory
 * and produces a pass/fail report. Much faster than running each group separately.
 *
 * Usage: node scripts/test-triage.js
 *        npm run test:triage
 *        npm run test:triage -- --json=report.json
 *        npm run test:triage -- --debug  (print raw JSON path on failure)
 *
 * Output: Console table + optional JSON file (--json=path)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TESTS_ROOT = path.join(ROOT, 'src/lib/tests');
const TEMP_JSON = path.join(ROOT, '.test-triage-temp.json');

/**
 * Group definitions: maps path segments to group id/label.
 * Order matters - first match wins. Paths are relative to src/lib/tests/.
 */
const TEST_GROUPS = [
	{ id: 'ci-placeholder', label: 'CI Placeholder', match: /^ci-placeholder\.test\.ts$/ },
	{ id: 'unit-helpers', label: 'Unit (helpers)', match: /^unit\/helpers\// },
	{ id: 'unit-utils', label: 'Unit (utils)', match: /^unit\/utils\// },
	{ id: 'validators', label: 'Validators', match: /^validators\.test\.ts$/ },
	{
		id: 'formatters',
		label: 'Formatters (currency, date)',
		match: /^(currencyFormatter|dateFormatter)\.test\.ts$/,
	},
	{
		id: 'crypto',
		label: 'Crypto & Encoding',
		match: /^(crypto|encoding)\.test\.ts$/,
	},
	{
		id: 'auth',
		label: 'Auth',
		match: /^auth(-|\.test)/,
	},
	{
		id: 'root-other',
		label: 'Root (deviceIdentity, findTasks, nostr, profile)',
		match: /^(deviceIdentity|findTasks|nip44-message|nostr-message|profile-cache)\.test\.ts$/,
	},
	{ id: 'api', label: 'API Services', match: /^api\// },
	{ id: 'utils', label: 'Utils', match: /^utils\// },
	{ id: 'stores', label: 'Stores', match: /^stores\// },
	{ id: 'components', label: 'Components', match: /^components\// },
	{ id: 'routes', label: 'Routes', match: /^routes\// },
	{ id: 'integration', label: 'Integration (Escrow)', match: /^integration\// },
];

function getGroupForFile(relativeFromTests) {
	const relative = relativeFromTests.replace(/\\/g, '/');
	for (const g of TEST_GROUPS) {
		if (g.match.test(relative)) return g;
	}
	return { id: 'other', label: 'Other', match: /.*/ };
}

/**
 * Run vitest once for all tests in src/lib/tests with JSON reporter.
 */
function runVitest() {
	return new Promise((resolve) => {
		const args = [
			'vitest',
			'run',
			'--config',
			'vitest.triage.config.ts',
			'src/lib/tests/',
		];

		const proc = spawn('npx', args, {
			cwd: ROOT,
			stdio: ['ignore', 'pipe', 'pipe'],
			shell: true,
			env: { ...process.env, TEST_TRIAGE_OUTPUT: TEMP_JSON },
		});

		let stderr = '';
		proc.stderr?.on('data', (chunk) => {
			stderr += chunk.toString();
		});

		proc.on('close', (code) => {
			let json = null;
			try {
				if (fs.existsSync(TEMP_JSON)) {
					json = JSON.parse(fs.readFileSync(TEMP_JSON, 'utf8'));
					fs.unlinkSync(TEMP_JSON);
				}
			} catch (e) {
				// ignore
			}
			resolve({ code, json, stderr });
		});

		proc.on('error', (err) => {
			resolve({ code: -1, json: null, stderr: String(err) });
		});
	});
}

/**
 * Aggregate JSON results by group.
 */
function aggregateByGroup(json) {
	const groupStats = new Map();
	for (const g of TEST_GROUPS) {
		groupStats.set(g.id, {
			group: g,
			filesPassed: 0,
			filesFailed: 0,
			filesTotal: 0,
			testsPassed: 0,
			testsFailed: 0,
			testsTotal: 0,
		});
	}

	const testResults = json?.testResults ?? [];
	for (const file of testResults) {
		const fullPath = file.name || '';
		const relPath = path.relative(ROOT, fullPath).replace(/\\/g, '/');
		const relFromTests = relPath.startsWith('src/lib/tests/')
			? relPath.slice('src/lib/tests/'.length)
			: relPath;
		const group = getGroupForFile(relFromTests);
		if (!groupStats.has(group.id)) {
			groupStats.set(group.id, {
				group,
				filesPassed: 0,
				filesFailed: 0,
				filesTotal: 0,
				testsPassed: 0,
				testsFailed: 0,
				testsTotal: 0,
			});
		}
		const stats = groupStats.get(group.id);
		if (!stats) continue;

		stats.filesTotal++;
		const passed = file.status === 'passed';
		if (passed) stats.filesPassed++;
		else stats.filesFailed++;

		const assertions = file.assertionResults ?? [];
		for (const a of assertions) {
			stats.testsTotal++;
			if (a.status === 'passed') stats.testsPassed++;
			else stats.testsFailed++;
		}
	}

	return Array.from(groupStats.values()).filter((s) => s.filesTotal > 0);
}

/**
 * Format a result row for the table.
 */
function formatRow(r, index) {
	const status = r.filesFailed === 0 && r.testsFailed === 0 ? '✓' : '✗';
	const files = `${r.filesPassed}/${r.filesTotal}`;
	const tests = `${r.testsPassed}/${r.testsTotal}`;
	const failInfo =
		r.filesFailed > 0 || r.testsFailed > 0
			? ` (${r.filesFailed} files, ${r.testsFailed} tests failed)`
			: '';
	return {
		'#': index + 1,
		Status: status,
		Group: r.group.label,
		Files: files,
		Tests: tests,
		Notes: failInfo || '-',
	};
}

/**
 * Print a simple ASCII table.
 */
function printTable(rows) {
	const colWidths = { '#': 3, Status: 6, Group: 42, Files: 10, Tests: 10, Notes: 32 };
	const cols = ['#', 'Status', 'Group', 'Files', 'Tests', 'Notes'];

	const head = cols.map((c) => String(c).padEnd(colWidths[c])).join(' │ ');
	const sep = cols.map((c) => '─'.repeat(colWidths[c])).join('─┼─');

	console.log('\n' + head);
	console.log(sep);

	for (const row of rows) {
		const line = cols
			.map((c) => {
				const val = String(row[c] ?? '');
				return val.slice(0, colWidths[c]).padEnd(colWidths[c]);
			})
			.join(' │ ');
		console.log(line);
	}
}

async function main() {
	const jsonPath = process.argv.find((a) => a.startsWith('--json='))?.split('=')[1];
	const debug = process.argv.includes('--debug');

	console.log('BitTasker Test Triage');
	console.log('====================');
	console.log('Running all tests (single vitest run)...\n');

	const { code, json, stderr } = await runVitest();

	if (!json) {
		console.error('Could not load test results. Vitest may have failed.');
		if (debug && stderr) console.error(stderr.slice(-2000));
		process.exit(1);
	}

	const aggregated = aggregateByGroup(json);

	// Sort by group order
	const order = TEST_GROUPS.map((g) => g.id);
	aggregated.sort((a, b) => {
		const ia = order.indexOf(a.group.id);
		const ib = order.indexOf(b.group.id);
		return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
	});

	const rows = aggregated.map((r, i) => formatRow(r, i));
	printTable(rows);

	const totalPassed = aggregated.filter((r) => r.filesFailed === 0 && r.testsFailed === 0).length;
	const totalFailed = aggregated.length - totalPassed;
	const totalFiles = aggregated.reduce((s, r) => s + r.filesTotal, 0);
	const totalTests = aggregated.reduce((s, r) => s + r.testsTotal, 0);
	const totalTestsPassed = aggregated.reduce((s, r) => s + r.testsPassed, 0);
	const totalTestsFailed = aggregated.reduce((s, r) => s + r.testsFailed, 0);

	console.log('\n--- Summary ---');
	console.log(`Groups: ${totalPassed} passed, ${totalFailed} failed (of ${aggregated.length})`);
	console.log(`Tests:  ${totalTestsPassed} passed, ${totalTestsFailed} failed (of ${totalTests})`);
	console.log(`Overall: ${code === 0 ? '✓ PASSED' : '✗ FAILED'}`);

	const greenGroups = aggregated.filter((r) => r.filesFailed === 0 && r.testsFailed === 0 && r.testsTotal > 0);
	if (greenGroups.length > 0) {
		console.log('\n--- Green (ready for tests/ci) ---');
		greenGroups.forEach((r) => console.log(`  - ${r.group.label} (${r.group.id})`));
	}

	const redGroups = aggregated.filter((r) => r.filesFailed > 0 || r.testsFailed > 0);
	if (redGroups.length > 0) {
		console.log('\n--- Needs work ---');
		redGroups.forEach((r) =>
			console.log(
				`  - ${r.group.label} (${r.group.id}): ${r.filesFailed} files, ${r.testsFailed} tests failed`,
			),
		);
	}

	if (jsonPath) {
		const out = {
			timestamp: new Date().toISOString(),
			overallPassed: code === 0,
			summary: {
				groupsTotal: aggregated.length,
				groupsPassed: totalPassed,
				groupsFailed: totalFailed,
				testsTotal: totalTests,
				testsPassed: totalTestsPassed,
				testsFailed: totalTestsFailed,
			},
			groups: aggregated.map((r) => ({
				id: r.group.id,
				label: r.group.label,
				passed: r.filesFailed === 0 && r.testsFailed === 0,
				filesPassed: r.filesPassed,
				filesFailed: r.filesFailed,
				filesTotal: r.filesTotal,
				testsPassed: r.testsPassed,
				testsFailed: r.testsFailed,
				testsTotal: r.testsTotal,
			})),
		};
		fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');
		console.log(`\nJSON report written to ${jsonPath}`);
	}

	process.exit(code);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
	return readFileSync(path, 'utf8');
}

describe('qvac ops jobs', () => {
	const ci = source('.gitlab-ci.yml');
	const jobs = source('.gitlab/ci/qvac-ops.yml');

	it('keeps the three jobs manual on sandbox and dev', () => {
		expect(ci).toContain('- ops');
		expect(ci).toContain('local: .gitlab/ci/qvac-ops.yml');
		for (const name of ['qvac-setup:', 'assistant-key:', 'search-embed:']) {
			expect(jobs).toContain(name);
		}
		expect(jobs).toContain('when: manual');
		expect(jobs).toContain('$CI_COMMIT_BRANCH == "sandbox/rgb-wasm-phase0"');
		expect(jobs).toContain('$CI_COMMIT_BRANCH == "dev"');
		expect(jobs).toContain('$CI_COMMIT_BRANCH == "master"');
		expect(jobs.indexOf('when: never')).toBeLessThan(jobs.indexOf('when: manual'));
		expect(jobs).not.toContain('--env production');
		expect(jobs).not.toContain('CI_COMMIT_BRANCH == "master"\n      when: manual');
	});

	it('does not echo the assistant secret', () => {
		const script = source('scripts/qvac-ci-assistant-key.sh');
		expect(script).toContain('set +x');
		expect(script).toContain('CI_DEBUG_TRACE');
		expect(script).toContain('wrangler secret put ASSISTANT_NSEC');
		expect(script).toContain('<"$nsec_file"');
		expect(script).not.toContain('echo "$nsec"');
		expect(script).not.toContain('--env production');
		expect(script).toContain('assistant npub:');
	});

	it('prints an npub and writes the nsec only to the file', () => {
		const dir = mkdtempSync(join(tmpdir(), 'qvac-key-'));
		const file = join(dir, 'nsec');
		const result = spawnSync(process.execPath, ['scripts/qvac-assistant-key.mjs', file], {
			encoding: 'utf8'
		});
		expect(result.status).toBe(0);
		expect(result.stdout.trim()).toMatch(/^npub1/);
		expect(result.stdout).not.toContain('nsec1');
		expect(result.stderr).not.toContain('nsec1');
		const stored = readFileSync(file, 'utf8');
		expect(stored).toMatch(/^nsec1/);
		expect(stored).not.toContain('\n');
	});

	it('checks embed and ocr without printing the model list', () => {
		const dir = mkdtempSync(join(tmpdir(), 'qvac-models-'));
		const file = join(dir, 'models.json');
		writeFileSync(
			file,
			JSON.stringify({
				data: [{ id: 'llama' }, { id: 'embed' }, { id: 'ocr' }, { id: 'secret-model-body' }]
			})
		);
		const result = spawnSync(process.execPath, ['scripts/qvac-models-check.mjs', file], {
			encoding: 'utf8'
		});
		expect(result.status).toBe(0);
		expect(result.stdout).toBe('embed present\nocr present\n');
		expect(result.stdout).not.toContain('secret-model-body');
	});
});

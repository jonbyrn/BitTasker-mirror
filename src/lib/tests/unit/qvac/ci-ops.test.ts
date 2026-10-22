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

	it('runs in Docker on the vps runner and calls the host by variable', () => {
		expect(jobs).toContain('- vps');
		expect(jobs).not.toContain('self-hosted');
		expect(jobs).not.toContain('qvac-vps');
		expect(jobs).toContain('QVAC_LOCAL_URL: http://127.0.0.1:11434');
		expect(jobs).toContain('TYPESENSE_LOCAL_URL: http://127.0.0.1:8108');
	});

	it('reads the Typesense key from CI and does not print it', () => {
		const script = source('scripts/qvac-ci-search-embed.sh');
		expect(script).toContain('set +x');
		expect(script).toContain('CI_DEBUG_TRACE');
		expect(script).toContain('Missing TYPESENSE_API_KEY.');
		expect(script).toContain('does not read /opt/bittasker/typesense.env');
		expect(script).not.toContain('. /opt/bittasker/typesense.env');
		expect(script).not.toContain('TYPESENSE_SSH_');
		expect(script).toContain('QVAC_LOCAL_URL:-http://127.0.0.1:11434');
		expect(script).toContain('TYPESENSE_LOCAL_URL:-http://127.0.0.1:8108');
		expect(script).not.toContain('echo "$TYPESENSE_API_KEY"');
		expect(script).not.toContain('echo "$QVAC_BEARER_TOKEN"');
		expect(script).toContain('unset TYPESENSE_API_KEY');
	});

	it('uses SSH for qvac-setup only when QVAC_SSH_HOST is set', () => {
		const script = source('scripts/qvac-ci-setup.sh');
		expect(script).toContain('set +x');
		expect(script).toContain('CI_DEBUG_TRACE');
		expect(script).toContain('Missing QVAC_BEARER_TOKEN.');
		expect(script).toContain('QVAC_LOCAL_URL:-http://127.0.0.1:11434');
		expect(script).toContain('if [ -n "${QVAC_SSH_HOST:-}" ]');
		expect(script).not.toContain('echo "$QVAC_BEARER_TOKEN"');
		expect(script).not.toContain('echo "$QVAC_SSH_PRIVATE_KEY"');
		expect(script).not.toContain('/opt/bittasker/typesense.env');
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

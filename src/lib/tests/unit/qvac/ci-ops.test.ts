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
		expect(script).toContain('QVAC_EMBED_STRICT=true');
	});

	it('checks embed and ocr and leaves the restart to Hotfix', () => {
		const script = source('scripts/qvac-ci-setup.sh');
		const readme = source('services/qvac/README.md');
		const manual = 'Manual step: ask BitTasker Hotfix to restart QVAC on the VPS';
		expect(script).toContain('set +x');
		expect(script).toContain('CI_DEBUG_TRACE');
		expect(script).toContain('Missing QVAC_BEARER_TOKEN.');
		expect(script).toContain('QVAC_LOCAL_URL:-http://127.0.0.1:11434');
		expect(script).toContain('/api/pull');
		expect(script).toContain('/api/create');
		expect(script).toContain('/api/embed');
		expect(script).toContain('embeddinggemma');
		expect(script).toContain(manual);
		expect(readme).toContain(manual);
		expect(jobs).toContain('bash scripts/ci-ensure-tools.sh curl');
		expect(source('scripts/ci-ensure-tools.sh')).toContain('apt-get');
		expect(source('scripts/ci-ensure-tools.sh')).toContain('apk add');
		expect(script).not.toContain('echo "$QVAC_BEARER_TOKEN"');
		expect(script).not.toContain('/opt/bittasker/typesense.env');
		for (const name of [
			'QVAC_SSH_HOST',
			'QVAC_SSH_PRIVATE_KEY',
			'QVAC_SSH_USER',
			'QVAC_SSH_PORT'
		]) {
			expect(script).not.toContain(name);
			expect(jobs).not.toContain(name);
			expect(readme).not.toContain(name);
		}
		expect(script).not.toContain('ssh ');
		expect(jobs).not.toContain('openssh');
	});

	it('does not echo the assistant secret', () => {
		const script = source('scripts/qvac-ci-assistant-key.sh');
		expect(script).toContain('set +x');
		expect(script).toContain('CI_DEBUG_TRACE');
		expect(script).toContain('wrangler versions secret put ASSISTANT_NSEC');
		expect(script).toContain('--name "$worker_name"');
		expect(script).toContain('--env "$wrangler_env"');
		expect(script).toContain('export CLOUDFLARE_ACCOUNT_ID');
		expect(script).toContain('Keeping the existing key.');
		expect(script).toContain('<"$nsec_file"');
		expect(script).not.toContain('echo "$nsec"');
		expect(script).not.toContain('cat "$nsec_file"');
		expect(script).not.toContain('--env production');
		expect(script).toContain('assistant npub:');
	});

	it('reads a sandbox worker name and refuses production', () => {
		const dir = mkdtempSync(join(tmpdir(), 'qvac-worker-'));
		const file = join(dir, 'wrangler.toml');
		writeFileSync(
			file,
			'[env.sandbox]\nname = "bittasker-sandbox"\n\n[env.production]\nname = "bittasker-prod-worker"\n'
		);
		const sandbox = spawnSync(process.execPath, ['scripts/qvac-worker-name.mjs', 'sandbox', file], {
			encoding: 'utf8'
		});
		expect(sandbox.status).toBe(0);
		expect(sandbox.stdout).toBe('bittasker-sandbox');
		const production = spawnSync(
			process.execPath,
			['scripts/qvac-worker-name.mjs', 'production', file],
			{ encoding: 'utf8' }
		);
		expect(production.status).not.toBe(0);
		expect(production.stdout).not.toContain('bittasker-prod-worker');
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

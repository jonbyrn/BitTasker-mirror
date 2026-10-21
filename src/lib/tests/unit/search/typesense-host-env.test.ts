import { execFileSync } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveScopedSearchKey } from '$lib/search/save-search-key.js';
import {
	ensureTypesenseEnv,
	fingerprint,
	productionCatalogRelay,
	readEnvFile
} from '$lib/search/search-key-file.js';

const secret = 'scoped-search-key-value';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('typesense host env', () => {
	it('creates a 0600 env file once and does not print the admin key', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'typesense-env-'));
		const file = join(dir, 'typesense.env');
		const logs: string[] = [];
		const spy = vi.spyOn(console, 'log').mockImplementation((line) => {
			logs.push(String(line));
		});
		const first = await ensureTypesenseEnv(file);
		const second = await ensureTypesenseEnv(file);
		const stored = await readEnvFile(file);
		const mode = (await stat(file)).mode & 0o777;
		expect(first.createdAdmin).toBe(true);
		expect(second.createdAdmin).toBe(false);
		expect(second.adminFingerprint).toBe(first.adminFingerprint);
		expect(stored.TYPESENSE_API_KEY).toBeTruthy();
		expect(stored.NOSTR_RELAY_URLS).toContain('wss://relay.bittasker.com');
		expect(productionCatalogRelay(stored.NOSTR_RELAY_URLS)).toBe(false);
		expect(mode).toBe(0o600);
		expect(logs.join('\n')).not.toContain(stored.TYPESENSE_API_KEY);
		expect(fingerprint(stored.TYPESENSE_API_KEY || '')).toBe(first.adminFingerprint);
		spy.mockRestore();
	});

	it('writes the search-only key to the env file and logs a fingerprint', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'typesense-key-'));
		const file = join(dir, 'typesense.env');
		await ensureTypesenseEnv(file);
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, options?: RequestInit) => {
				calls.push(`${options?.method || 'GET'} ${url}`);
				if (String(url).endsWith('/keys')) {
					return new Response(JSON.stringify({ value: secret }), { status: 200 });
				}
				if ((options?.method || 'GET') === 'GET') return new Response('missing', { status: 404 });
				return new Response('{}', { status: 200 });
			})
		);
		const logs: string[] = [];
		vi.spyOn(console, 'log').mockImplementation((line) => {
			logs.push(String(line));
		});
		const env = {
			TYPESENSE_HOST: 'http://127.0.0.1:8108',
			TYPESENSE_API_KEY: (await readEnvFile(file)).TYPESENSE_API_KEY,
			TYPESENSE_ENV_FILE: file,
			SEARCH_PROVIDER: 'typesense'
		};
		await saveScopedSearchKey(env);
		await saveScopedSearchKey(env);
		const stored = await readEnvFile(file);
		expect(stored.TYPESENSE_API_KEY).toBe(env.TYPESENSE_API_KEY);
		expect(stored.TYPESENSE_SEARCH_ONLY_KEY).toBe(secret);
		expect(calls.filter((call) => call.includes('/keys'))).toHaveLength(1);
		const text = logs.join('\n');
		expect(text).toContain(`fingerprint=${fingerprint(secret)}`);
		expect(text).not.toContain(secret);
		expect(text).not.toContain(String(env.TYPESENSE_API_KEY));
	});

	it('refuses the production catalog relays', () => {
		expect(productionCatalogRelay('wss://relay2.bittasker.com,wss://nos.lol')).toBe(true);
		expect(productionCatalogRelay('wss://relay1.bittasker.com')).toBe(true);
		expect(productionCatalogRelay('wss://relay2-dev.bittasker.com,wss://nos.lol')).toBe(false);
	});

	it('warns and continues when no Docker host is configured', () => {
		const marker = 'super-secret-typesense-key';
		const output = execFileSync('bash', ['scripts/deploy-typesense-sandbox.sh'], {
			cwd: process.cwd(),
			env: {
				PATH: '/usr/bin:/bin',
				HOME: tmpdir(),
				TYPESENSE_DOCKER_BIN: '',
				TYPESENSE_API_KEY: marker,
				TYPESENSE_SEARCH_ONLY_KEY: marker
			},
			encoding: 'utf8'
		});
		expect(output).toContain(
			'WARNING: Typesense skipped. No Docker host is available (no /var/run/docker.sock and no TYPESENSE_SSH_HOST).'
		);
		expect(output).toContain('TYPESENSE_SSH_USER');
		expect(output).toContain('TYPESENSE_SSH_PRIVATE_KEY');
		expect(output).toContain('TYPESENSE_SSH_PORT');
		expect(output).toContain('MEILI_SEARCH_KEY');
		expect(output).toContain('self-hosted');
		expect(output).not.toContain(marker);
	});

	it('fails when a Typesense host is configured but cannot be used', () => {
		const marker = 'super-secret-typesense-key';
		let output = '';
		let status = 0;
		try {
			execFileSync('bash', ['scripts/deploy-typesense-sandbox.sh'], {
				cwd: process.cwd(),
				env: {
					PATH: '/usr/bin:/bin',
					HOME: tmpdir(),
					TYPESENSE_DOCKER_BIN: '',
					TYPESENSE_SSH_HOST: 'typesense-host.invalid',
					TYPESENSE_API_KEY: marker
				},
				encoding: 'utf8'
			});
		} catch (error) {
			const failed = error as { status?: number; stdout?: string; stderr?: string };
			status = failed.status || 0;
			output = `${failed.stdout || ''}\n${failed.stderr || ''}`;
		}
		expect(status).toBe(1);
		expect(output).not.toContain('WARNING: Typesense skipped');
		expect(output).not.toContain(marker);
	});
});

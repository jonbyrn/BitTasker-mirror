import assert from 'node:assert/strict';
import test from 'node:test';

import { validateServiceE2EBootstrap } from '../../scripts/validate-service-e2e-bootstrap.mjs';
import fs from 'node:fs';
import path from 'node:path';

const baseEnv = {
	CI: '1',
	VITE_API_URL: 'https://api.example.test',
	VITE_NOSTR_RELAY_URL: 'wss://relay.example.test',
	VITE_E2E_TURNSTILE_BYPASS: 'true',
	SERVICE_E2E_BOOTSTRAP_MODE: 'route-harness'
};

test('accepts the current route-harness CI contract', () => {
	const result = validateServiceE2EBootstrap(baseEnv, {
		buildArtifactExists: true,
		previewManifestExists: true,
		previewClientExists: true,
		harnessRouteExists: true
	});

	assert.equal(result.bootstrapMode, 'route-harness');
	assert.deepEqual(result.errors, []);
});

test('requires a valid backend URL', () => {
	const result = validateServiceE2EBootstrap(
		{
			...baseEnv,
			VITE_API_URL: 'not-a-url'
		},
		{
			buildArtifactExists: true,
			previewManifestExists: true,
			previewClientExists: true,
			harnessRouteExists: true
		}
	);

	assert.match(result.errors.join('\n'), /VITE_API_URL/);
});

test('requires either a build artifact or an explicit preview URL in CI', () => {
	const result = validateServiceE2EBootstrap(baseEnv, {
		buildArtifactExists: false,
		previewManifestExists: true,
		previewClientExists: true,
		harnessRouteExists: true
	});

	assert.match(result.errors.join('\n'), /build\/index\.html/);
});

test('requires the SvelteKit preview manifest in CI preview mode', () => {
	const result = validateServiceE2EBootstrap(baseEnv, {
		buildArtifactExists: true,
		previewManifestExists: false,
		previewClientExists: true,
		harnessRouteExists: true
	});

	assert.match(result.errors.join('\n'), /\.svelte-kit\/output\/server\/manifest\.js/);
});

test('requires the SvelteKit preview client output in CI preview mode', () => {
	const result = validateServiceE2EBootstrap(baseEnv, {
		buildArtifactExists: true,
		previewManifestExists: true,
		previewClientExists: false,
		harnessRouteExists: true
	});

	assert.match(result.errors.join('\n'), /\.svelte-kit\/output\/client/);
});

test('requires TEST_NOSTR_KEY for seeded-auth mode', () => {
	const result = validateServiceE2EBootstrap(
		{
			...baseEnv,
			SERVICE_E2E_BOOTSTRAP_MODE: 'seeded-auth'
		},
		{
			buildArtifactExists: true,
			previewManifestExists: true,
			previewClientExists: true,
			harnessRouteExists: true
		}
	);

	assert.match(result.errors.join('\n'), /TEST_NOSTR_KEY/);
});

test('gitlab ci build artifacts keep both build and .svelte-kit output paths', () => {
	const gitlabCi = fs.readFileSync(path.join(process.cwd(), '.gitlab-ci.yml'), 'utf8');

	assert.match(gitlabCi, /-\s+build\//);
	assert.match(gitlabCi, /-\s+\.svelte-kit\/output\//);
});

test('gitlab ci keeps the service bootstrap mode and turnstile bypass explicit', () => {
	const gitlabCi = fs.readFileSync(path.join(process.cwd(), '.gitlab-ci.yml'), 'utf8');

	assert.match(gitlabCi, /SERVICE_E2E_BOOTSTRAP_MODE:\s*"route-harness"/);
	assert.match(gitlabCi, /VITE_E2E_TURNSTILE_BYPASS:\s*"true"/);
});

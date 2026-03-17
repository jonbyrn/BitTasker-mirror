#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const cwd = process.cwd();
const ROUTE_HARNESS_MODE = 'route-harness';
const SEEDED_AUTH_MODE = 'seeded-auth';
const VALID_BOOTSTRAP_MODES = new Set([ROUTE_HARNESS_MODE, SEEDED_AUTH_MODE]);
const HARNESS_SENTINEL = '/e2e/service-harness.html';
const ROUTE_MOCK_SENTINEL = 'page.route(';
const forbiddenSpecPatterns = [
	{
		pattern: /fixtures\/passkey-auth-from-file/,
		reason: 'introduces passkey credential bootstrap into the service-only CI slice'
	},
	{
		pattern: /fixtures\/signup-login-auth/,
		reason: 'introduces signup-order bootstrap into the service-only CI slice'
	},
	{
		pattern: /fixtures\/auth(?:['"/])/,
		reason: 'introduces auth fixture bootstrap into the service-only CI slice'
	},
	{
		pattern: /webauthnCredentialsFileExists|CREDENTIALS_MISSING_MESSAGE/,
		reason: 'introduces WebAuthn credentials-file prerequisites into the service-only CI slice'
	},
	{
		pattern: /authenticatedPageFromPasskeyFile|\/auth\/login/,
		reason: 'introduces authenticated-user startup dependencies into the service-only CI slice'
	},
	{
		pattern: /TEST_NOSTR_KEY/,
		reason: 'introduces explicit relay/account secrets into the service-only CI slice'
	}
];

function fileExists(relativePath) {
	return fs.existsSync(path.join(cwd, relativePath));
}

function hasValue(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function isAbsoluteUrl(value, allowedProtocols) {
	if (!hasValue(value)) {
		return false;
	}

	try {
		const parsed = new URL(value);
		return allowedProtocols.includes(parsed.protocol);
	} catch {
		return false;
	}
}

export function validateServiceE2EBootstrap(
	env = process.env,
	options = {}
) {
	const isCI = Boolean(env.CI);
	const overrideBaseUrl = (env.PW_E2E_BASE_URL || '').trim();
	const buildArtifactExists =
		typeof options.buildArtifactExists === 'boolean'
			? options.buildArtifactExists
			: fileExists('build/index.html');
	const previewManifestExists =
		typeof options.previewManifestExists === 'boolean'
			? options.previewManifestExists
			: fileExists('.svelte-kit/output/server/manifest.js');
	const previewClientExists =
		typeof options.previewClientExists === 'boolean'
			? options.previewClientExists
			: fileExists('.svelte-kit/output/client');
	const harnessRouteExists =
		typeof options.harnessRouteExists === 'boolean'
			? options.harnessRouteExists
			: fileExists('src/routes/e2e/service-harness.html/+page.svelte');

	const errors = [];
	const notes = [];
	const bootstrapMode = (env.SERVICE_E2E_BOOTSTRAP_MODE || ROUTE_HARNESS_MODE).trim();

	const requiredSpecs = [
		['Tasker quotes browser slice', 'tests/e2e/service-quotes-tasker.spec.ts'],
		['Taskee quotes browser slice', 'tests/e2e/service-quotes-taskee.spec.ts'],
		['Contracts browser slice', 'tests/e2e/service-quotes-contracts.spec.ts'],
		['UX hardening browser slice', 'tests/e2e/service-ux-hardening.spec.ts'],
		['Instant-buy browser slice', 'tests/e2e/service-instant-buy.spec.ts'],
		['Homepage featured-services browser slice', 'tests/e2e/homepage-featured-services.spec.ts'],
		['Task/service regression browser slice', 'tests/e2e/tasks-services-regression-browse.spec.ts'],
		['Service visual snapshot slice', 'tests/e2e/service-quotes-visual.spec.ts'],
		['Homepage visual snapshot slice', 'tests/e2e/homepage-featured-services-visual.spec.ts']
	];
	const requiredVisualBaselines = [
		[
			'Service drawer visual baseline',
			'tests/e2e/service-quotes-visual.spec.ts-snapshots/service-contract-drawer-chromium-chromium-linux.png'
		],
		[
			'Service completion-modal visual baseline',
			'tests/e2e/service-quotes-visual.spec.ts-snapshots/service-contract-completion-modal-chromium-chromium-linux.png'
		],
		[
			'Homepage featured-services visual baseline',
			'tests/e2e/homepage-featured-services-visual.spec.ts-snapshots/homepage-featured-services-loading-shell-chromium-chromium-linux.png'
		]
	];

	if (!fileExists('playwright.config.ts')) {
		errors.push('Playwright config is missing: playwright.config.ts');
	}

	for (const [description, relativePath] of requiredSpecs) {
		if (!fileExists(relativePath)) {
			errors.push(`${description} is missing: ${relativePath}`);
		}
	}

	for (const [description, relativePath] of requiredVisualBaselines) {
		if (!fileExists(relativePath)) {
			errors.push(`${description} is missing: ${relativePath}`);
		}
	}

	if (!VALID_BOOTSTRAP_MODES.has(bootstrapMode)) {
		errors.push(
			`SERVICE_E2E_BOOTSTRAP_MODE must be one of ${[...VALID_BOOTSTRAP_MODES].join(', ')}; received "${bootstrapMode}".`
		);
	}

	if (!isAbsoluteUrl(env.VITE_API_URL, ['http:', 'https:'])) {
		errors.push(
			'VITE_API_URL is required and must be an absolute http(s) URL so the preview bundle targets a deterministic backend.'
		);
	}

	if (!isAbsoluteUrl(env.VITE_NOSTR_RELAY_URL, ['ws:', 'wss:'])) {
		errors.push(
			'VITE_NOSTR_RELAY_URL is required and must be an absolute ws(s) URL so the preview bundle targets a deterministic relay.'
		);
	}

	if (isCI && (env.VITE_E2E_TURNSTILE_BYPASS || '').trim() !== 'true') {
		errors.push(
			'VITE_E2E_TURNSTILE_BYPASS must be set to "true" in CI so shared auth-capable app flows stay deterministic.'
		);
	}

	if (bootstrapMode === ROUTE_HARNESS_MODE && !harnessRouteExists) {
		errors.push(
			'SERVICE_E2E_BOOTSTRAP_MODE=route-harness requires src/routes/e2e/service-harness.html/+page.svelte.'
		);
	}

	if (bootstrapMode === SEEDED_AUTH_MODE && !hasValue(env.TEST_NOSTR_KEY)) {
		errors.push(
			'SERVICE_E2E_BOOTSTRAP_MODE=seeded-auth requires TEST_NOSTR_KEY so seeded Nostr-auth bootstrap is deterministic.'
		);
	}

	if (overrideBaseUrl) {
		if (!isAbsoluteUrl(overrideBaseUrl, ['http:', 'https:'])) {
			errors.push(
				'PW_E2E_BASE_URL must be an absolute http(s) URL when it is provided.'
			);
		} else {
			notes.push(
				`Using PW_E2E_BASE_URL=${overrideBaseUrl}; preview build artifact validation is skipped because Playwright will target an externally managed app server.`
			);
		}
	} else if (isCI) {
		if (!buildArtifactExists) {
			errors.push(
				'CI preview mode requires build/index.html from the build job unless PW_E2E_BASE_URL overrides the server target.'
			);
		}

		if (!previewManifestExists) {
			errors.push(
				'CI preview mode requires .svelte-kit/output/server/manifest.js from the build job so vite preview can start deterministically.'
			);
		}

		if (!previewClientExists) {
			errors.push(
				'CI preview mode requires .svelte-kit/output/client from the build job so vite preview can serve the built client bundle deterministically.'
			);
		}
	}

	if (bootstrapMode === ROUTE_HARNESS_MODE) {
		notes.push(
			'Current service browser suites run against the in-app harness and deterministic request mocks, so seeded passkey credentials and live relay bootstrap are intentionally out of scope for this CI slice.'
		);
	}

	for (const [, relativePath] of requiredSpecs) {
		if (!fileExists(relativePath)) {
			continue;
		}

		const source = fs.readFileSync(path.join(cwd, relativePath), 'utf8');
		const usesHarness = source.includes(HARNESS_SENTINEL);
		const usesRouteMocks = source.includes(ROUTE_MOCK_SENTINEL);

		if (!usesHarness && !usesRouteMocks) {
			errors.push(
				`${relativePath} must stay deterministic in CI by using the service harness route or inline Playwright request mocks.`
			);
		}

		for (const rule of forbiddenSpecPatterns) {
			if (rule.pattern.test(source)) {
				errors.push(`${relativePath} ${rule.reason}.`);
			}
		}
	}

	if (fileExists('playwright.config.ts')) {
		const playwrightConfig = fs.readFileSync(path.join(cwd, 'playwright.config.ts'), 'utf8');
		if (!playwrightConfig.includes('npm run preview')) {
			errors.push(
				'Playwright config no longer contains the preview bootstrap used by service CI.'
			);
		}
		if (!playwrightConfig.includes("VITE_E2E_TURNSTILE_BYPASS: 'true'")) {
			errors.push(
				'Playwright config no longer injects VITE_E2E_TURNSTILE_BYPASS for the web server bootstrap.'
			);
		}
	}

	if (fileExists('.gitlab-ci.yml')) {
		const gitlabCi = fs.readFileSync(path.join(cwd, '.gitlab-ci.yml'), 'utf8');
		if (!gitlabCi.includes('- build/') || !gitlabCi.includes('- .svelte-kit/output/')) {
			errors.push(
				'.gitlab-ci.yml build artifacts must preserve both build/ and .svelte-kit/output/ so service preview jobs can start deterministically.'
			);
		}
		if (!gitlabCi.includes('SERVICE_E2E_BOOTSTRAP_MODE: "route-harness"')) {
			errors.push(
				'.gitlab-ci.yml must declare SERVICE_E2E_BOOTSTRAP_MODE=\"route-harness\" for service-quote-e2e so the CI bootstrap contract stays explicit.'
			);
		}
		if (!gitlabCi.includes('VITE_E2E_TURNSTILE_BYPASS: "true"')) {
			errors.push(
				'.gitlab-ci.yml must declare VITE_E2E_TURNSTILE_BYPASS=\"true\" for service-quote-e2e so preview-mode auth-capable flows stay deterministic.'
			);
		}
		if (!gitlabCi.includes('npm run test:e2e:validate-service-bootstrap')) {
			errors.push(
				'.gitlab-ci.yml no longer runs the service E2E bootstrap validator before Playwright.'
			);
		}
		if (
			!gitlabCi.includes(
				"tests/e2e/service-quotes-*.spec.ts tests/e2e/service-ux-hardening*.spec.ts tests/e2e/service-instant-buy*.spec.ts tests/e2e/homepage-featured-services*.spec.ts tests/e2e/tasks-services-regression-*.spec.ts"
			)
		) {
			errors.push('.gitlab-ci.yml no longer pins the expected service TEST-G3 spec slice command.');
		}
		if (
			!gitlabCi.includes(
				"tests/e2e/service-quotes-visual*.spec.ts tests/e2e/homepage-featured-services-visual*.spec.ts"
			)
		) {
			errors.push('.gitlab-ci.yml no longer pins the expected service TEST-G4 visual slice command.');
		}
	}

	if (!isCI && !overrideBaseUrl) {
		notes.push(
			'Local mode detected; CI-only build-artifact enforcement is skipped because Playwright will start the dev server automatically.'
		);
	}

	const summaryLines = [
		'Service E2E bootstrap contract',
		'- service browser slices must exist locally (quotes, UX hardening, instant buy, homepage, regression, visual)',
		'- route-harness mode requires /e2e/service-harness.html because the current CI service suites depend on it for deterministic in-app fixtures',
		'- service browser slices must remain harness-backed or route-mocked; auth/passkey bootstrap is forbidden in this CI slice',
		'- CI preview mode requires build/ plus .svelte-kit/output/server/manifest.js and .svelte-kit/output/client unless PW_E2E_BASE_URL overrides the server target',
		'- CI preview mode requires VITE_API_URL, VITE_NOSTR_RELAY_URL, and VITE_E2E_TURNSTILE_BYPASS=true so the built app bundle is environment-complete',
		'- TEST-G4 visual baselines must remain present for the Chromium-pinned service/homepage snapshots',
		'- seeded-auth mode is reserved for future live seeded-account service slices and currently requires TEST_NOSTR_KEY'
	];

	return {
		bootstrapMode,
		errors,
		notes,
		summaryLines
	};
}

export function runValidation(env = process.env, options) {
	const result = validateServiceE2EBootstrap(env, options);

	for (const line of result.summaryLines) {
		console.log(line);
	}

	for (const note of result.notes) {
		console.log(`note: ${note}`);
	}

	if (result.errors.length > 0) {
		for (const error of result.errors) {
			console.error(`error: ${error}`);
		}
		process.exitCode = 1;
		return result;
	}

	console.log(`service E2E bootstrap validation passed (${result.bootstrapMode})`);
	return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	runValidation();
}

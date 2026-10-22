/**
 * Prepare secrets for the next bittasker-dev-worker upload.
 *
 * `wrangler deploy` posts a new version with bindings_inherit=strict. That
 * resolves inherit bindings against the latest upload, which may be an
 * undeployed version, not the version serving dev.bittasker.com. This worker
 * has no script-level secret store, so a deploy that does not send secret
 * values publishes a version without them.
 *
 * Secrets already on the latest upload are left for `--keep-vars`. Missing
 * ones are written to a JSON file from the environment. CLOUDFLARE_API_TOKEN
 * in this job is the deploy credential, so the worker binding of the same
 * name is taken only from WORKER_SECRET_CLOUDFLARE_API_TOKEN.
 *
 * The file is mode 0600. Values are never printed.
 */
import { chmodSync, writeFileSync } from 'node:fs';

const WORKER = 'bittasker-dev-worker';
const DEPLOY_TOKEN_NAMES = new Set(['CLOUDFLARE_API_TOKEN']);

/**
 * @param {string} name
 * @param {Record<string, string | undefined>} env
 */
export function explicitSecretValue(name, env) {
	const override = env[`WORKER_SECRET_${name}`];
	if (typeof override === 'string' && override.length > 0) return override;
	if (DEPLOY_TOKEN_NAMES.has(name)) return '';
	const value = env[name];
	return typeof value === 'string' ? value : '';
}

/**
 * @param {{ liveSecrets: string[], latestSecrets: string[], env: Record<string, string | undefined> }} input
 */
export function planDevWorkerSecrets(input) {
	/** @type {Record<string, string>} */
	const file = {};
	/** @type {string[]} */
	const missing = [];
	const latest = new Set(input.latestSecrets);
	for (const name of input.liveSecrets) {
		if (latest.has(name)) continue;
		const value = explicitSecretValue(name, input.env);
		if (value) file[name] = value;
		else missing.push(name);
	}
	missing.sort();
	return { file, missing };
}

/**
 * @param {Array<{ name?: string, type?: string }> | undefined} bindings
 */
export function secretNames(bindings) {
	return (bindings || [])
		.filter((binding) => binding && binding.type === 'secret_text' && binding.name)
		.map((binding) => String(binding.name))
		.sort();
}

/**
 * @param {string} path
 * @param {Record<string, string>} init
 */
async function cf(path, init = {}) {
	const account = process.env.CLOUDFLARE_ACCOUNT_ID || '';
	const token = process.env.CLOUDFLARE_API_TOKEN || '';
	if (!account || !token) {
		throw new Error(
			'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required to read worker versions.'
		);
	}
	const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			'Content-Type': 'application/json'
		}
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok || body.success === false) {
		const message = Array.isArray(body.errors)
			? body.errors.map((error) => String(error.message || error.code || '')).join('; ')
			: response.statusText;
		throw new Error(`Cloudflare ${response.status}: ${message}`);
	}
	return body.result;
}

async function main() {
	const output = process.argv[2];
	if (!output) {
		console.error('Usage: node scripts/ci/dev-worker-secrets.mjs <secrets-file>');
		process.exit(1);
	}
	const deployments = await cf(
		`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER}/deployments`
	);
	const liveId = deployments?.deployments?.[0]?.versions?.[0]?.version_id;
	if (!liveId) throw new Error('The live dev worker deployment has no version.');
	const [live, latest] = await Promise.all([
		cf(
			`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/workers/${WORKER}/versions/${liveId}`
		),
		cf(`/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers/workers/${WORKER}/versions/latest`)
	]);
	const liveSecrets = secretNames(live.bindings);
	const latestSecrets = secretNames(latest.bindings);
	const plan = planDevWorkerSecrets({
		liveSecrets,
		latestSecrets,
		env: process.env
	});
	if (plan.missing.length) {
		console.error(
			`Dev worker upload would drop secrets that are not on the latest version and not in the environment: ${plan.missing.join(', ')}`
		);
		console.error(
			'Set each one in the protected CI environment, or WORKER_SECRET_<NAME> when the name is already the deploy token. Deploy was not started.'
		);
		process.exit(1);
	}
	const names = Object.keys(plan.file);
	if (names.length === 0) {
		console.log(
			`Latest version ${latest.id} already has the live secrets (${liveSecrets.length}). --keep-vars will carry them.`
		);
		return;
	}
	writeFileSync(output, JSON.stringify(plan.file), { mode: 0o600 });
	chmodSync(output, 0o600);
	console.log(`Wrote ${names.length} secret names for the dev upload. Values were not printed.`);
}

const invoked = process.argv[1] && process.argv[1].endsWith('dev-worker-secrets.mjs');
if (invoked) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : 'Dev worker secret check failed.');
		process.exit(1);
	});
}

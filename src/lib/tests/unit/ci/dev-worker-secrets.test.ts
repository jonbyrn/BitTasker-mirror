import { describe, expect, it } from 'vitest';
import {
	planDevWorkerSecrets,
	secretNames
} from '../../../../../scripts/ci/dev-worker-secrets.mjs';

describe('planDevWorkerSecrets', () => {
	it('keeps a secret that is already on the latest upload', () => {
		const plan = planDevWorkerSecrets({
			liveSecrets: ['QVAC_BEARER_TOKEN'],
			latestSecrets: ['QVAC_BEARER_TOKEN'],
			env: {}
		});
		expect(plan).toEqual({ file: {}, missing: [] });
	});

	it('writes an explicit environment value when the latest upload lacks it', () => {
		const plan = planDevWorkerSecrets({
			liveSecrets: ['TYPESENSE_SEARCH_ONLY_KEY'],
			latestSecrets: [],
			env: { TYPESENSE_SEARCH_ONLY_KEY: 'search-key' }
		});
		expect(plan.missing).toEqual([]);
		expect(plan.file).toEqual({ TYPESENSE_SEARCH_ONLY_KEY: 'search-key' });
	});

	it('does not reuse the deploy token as the worker binding', () => {
		const plan = planDevWorkerSecrets({
			liveSecrets: ['CLOUDFLARE_API_TOKEN', 'SENTRY_AUTH_TOKEN'],
			latestSecrets: [],
			env: {
				CLOUDFLARE_API_TOKEN: 'deploy-token',
				WORKER_SECRET_CLOUDFLARE_API_TOKEN: 'worker-token',
				SENTRY_AUTH_TOKEN: 'sentry'
			}
		});
		expect(plan.missing).toEqual([]);
		expect(plan.file.CLOUDFLARE_API_TOKEN).toBe('worker-token');
		expect(plan.file.SENTRY_AUTH_TOKEN).toBe('sentry');
	});

	it('names secrets that the next upload would drop', () => {
		const plan = planDevWorkerSecrets({
			liveSecrets: ['QVAC_BEARER_TOKEN', 'TYPESENSE_SEARCH_ONLY_KEY'],
			latestSecrets: [],
			env: {}
		});
		expect(plan.file).toEqual({});
		expect(plan.missing).toEqual(['QVAC_BEARER_TOKEN', 'TYPESENSE_SEARCH_ONLY_KEY']);
	});

	it('reads secret names from version bindings', () => {
		expect(
			secretNames([
				{ name: 'TYPESENSE_HOST', type: 'plain_text' },
				{ name: 'QVAC_BEARER_TOKEN', type: 'secret_text' },
				{ name: 'STREAM', type: 'stream' }
			])
		).toEqual(['QVAC_BEARER_TOKEN']);
	});
});

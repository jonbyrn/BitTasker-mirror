#!/usr/bin/env node
/**
 * Fill missing Typesense embeddings from QVAC.
 * Logs counts and milliseconds. Never logs document text or keys.
 */
import { pathToFileURL } from 'node:url';
import {
	embedDimensions,
	embedTexts,
	resolveEmbedModel,
	embeddingSource,
	needsEmbedding
} from '../src/lib/qvac/embed.js';

const COLLECTIONS = ['tasks', 'services', 'profiles', 'shifts', 'listings'];

/**
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function embedBackfillBlocker(env) {
	if (env.QVAC_ENABLED !== 'true' || !String(env.QVAC_BASE_URL || env.QVAC_URL || '').trim()) {
		return 'QVAC_ENABLED and QVAC_BASE_URL are required. Nothing was deleted.';
	}
	if (!String(env.TYPESENSE_HOST || '').trim() || !String(env.TYPESENSE_API_KEY || '').trim()) {
		return 'TYPESENSE_HOST and TYPESENSE_API_KEY are required. Nothing was deleted.';
	}
	const prefix = String(env.TYPESENSE_COLLECTION_PREFIX || '').trim();
	if (!/^[a-z0-9_]{0,32}$/.test(prefix)) {
		return 'TYPESENSE_COLLECTION_PREFIX is invalid. Nothing was deleted.';
	}
	return '';
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 */
function collectionName(env, name) {
	const prefix = String(env.TYPESENSE_COLLECTION_PREFIX || '').trim();
	return prefix ? `${prefix}${name}` : name;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 */
async function exportDocs(env, name) {
	const host = String(env.TYPESENSE_HOST).replace(/\/$/, '');
	const response = await fetch(`${host}/collections/${collectionName(env, name)}/documents/export`, {
		headers: { 'X-TYPESENSE-API-KEY': String(env.TYPESENSE_API_KEY) }
	});
	if (response.status === 404) return [];
	if (!response.ok) throw new Error(`export ${name} ${response.status}`);
	const text = await response.text();
	return text
		.split('\n')
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @param {string} id
 * @param {number[]} embedding
 */
async function patchEmbedding(env, name, id, embedding) {
	const host = String(env.TYPESENSE_HOST).replace(/\/$/, '');
	const response = await fetch(
		`${host}/collections/${collectionName(env, name)}/documents/${encodeURIComponent(id)}`,
		{
			method: 'PATCH',
			headers: {
				'content-type': 'application/json',
				'X-TYPESENSE-API-KEY': String(env.TYPESENSE_API_KEY)
			},
			body: JSON.stringify({ embedding })
		}
	);
	return response.ok;
}

/**
 * @param {Record<string, string | undefined>} env
 */
export async function runEmbedBackfill(env) {
	const blocker = embedBackfillBlocker(env);
	if (blocker) throw new Error(blocker);
	const started = Date.now();
	const dim = embedDimensions(env);
	const model = await resolveEmbedModel(env);
	const ready = { ...env, QVAC_ENABLED: 'true', QVAC_EMBED_MODEL: model };
	if (env.QVAC_EMBED_STRICT === 'true') {
		const probe = await embedTexts(ready, ['embed probe']);
		if (!probe?.[0]) {
			throw new Error(
				`Embedding alias ${model} is not loaded at ${ready.QVAC_BASE_URL || ready.QVAC_URL}. Play qvac-setup to pull EmbeddingGemma (768d).`
			);
		}
	}
	let updated = 0;
	let skipped = 0;
	let failed = 0;
	for (const name of COLLECTIONS) {
		const docs = await exportDocs(ready, name);
		const pending = docs.filter(
			(doc) => doc && typeof doc.id === 'string' && embeddingSource(doc) && needsEmbedding(doc, dim)
		);
		skipped += docs.length - pending.length;
		for (let index = 0; index < pending.length; index += 16) {
			const batch = pending.slice(index, index + 16);
			const vectors = await embedTexts(
				ready,
				batch.map((doc) => embeddingSource(doc))
			);
			if (!vectors) {
				failed += batch.length;
				continue;
			}
			for (let slot = 0; slot < batch.length; slot += 1) {
				const vector = vectors[slot];
				if (!vector) {
					failed += 1;
					continue;
				}
				const ok = await patchEmbedding(ready, name, batch[slot].id, vector);
				if (ok) updated += 1;
				else failed += 1;
			}
		}
	}
	console.log(
		`search embed updated=${updated} skipped=${skipped} failed=${failed} ms=${Date.now() - started}`
	);
	return { updated, skipped, failed };
}

const launched =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (launched) {
	const blocker = embedBackfillBlocker(process.env);
	if (blocker) {
		console.error(blocker);
		process.exit(1);
	}
	runEmbedBackfill(process.env)
		.then((result) => {
			if (result.failed) process.exitCode = 1;
		})
		.catch((error) => {
			const message = error instanceof Error ? error.message : 'search embed failed';
			console.error(message);
			process.exit(1);
		});
}

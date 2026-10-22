/** QVAC text embeddings for Typesense hybrid search. No listing text is logged. */
import { classifyUpstream } from './gate.js';

/** EmbeddingGemma 300M. The Typesense field uses this width. */
export const EMBED_DIMENSIONS = 768;
export const EMBED_MODEL = 'embed';

/**
 * @param {Record<string, string | undefined> | undefined} env
 */
export function embedDimensions(env) {
	const parsed = Number(env?.QVAC_EMBED_DIM);
	if (Number.isInteger(parsed) && parsed >= 2 && parsed <= 4096) return parsed;
	return EMBED_DIMENSIONS;
}

/**
 * @param {Record<string, string | undefined> | undefined} env
 */
export function embedModel(env) {
	const name = String(env?.QVAC_EMBED_MODEL || EMBED_MODEL).trim();
	return name || EMBED_MODEL;
}

/**
 * Text the embedder sees for one indexed document. English and Spanish fields
 * share one vector so a query in either language can match.
 * @param {Record<string, unknown>} document
 */
export function embeddingSource(document) {
	return [document?.title, document?.title_es, document?.description, document?.description_es]
		.map((part) => (typeof part === 'string' ? part.trim() : ''))
		.filter(Boolean)
		.join('\n')
		.slice(0, 2000);
}

/**
 * @param {unknown} embedding
 * @param {number} dim
 */
export function isEmbedding(embedding, dim) {
	return (
		Array.isArray(embedding) &&
		embedding.length === dim &&
		embedding.every((value) => typeof value === 'number' && Number.isFinite(value))
	);
}

/**
 * @param {Record<string, unknown>} document
 * @param {number} dim
 */
export function needsEmbedding(document, dim) {
	return !isEmbedding(document?.embedding, dim);
}

/**
 * @param {number[]} vector
 * @param {number} [k]
 */
export function vectorQuery(vector, k = 100) {
	const body = vector.map((value) => Number(value.toFixed(6))).join(',');
	return `embedding:([${body}], k:${Math.max(1, k)}, alpha:0.6)`;
}

/**
 * @param {number[]} left
 * @param {number[]} right
 */
export function cosine(left, right) {
	const width = Math.min(left.length, right.length);
	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;
	for (let index = 0; index < width; index += 1) {
		dot += left[index] * right[index];
		leftNorm += left[index] * left[index];
		rightNorm += right[index] * right[index];
	}
	if (leftNorm === 0 || rightNorm === 0) return 0;
	return dot / Math.sqrt(leftNorm * rightNorm);
}

/**
 * @param {Record<string, string | undefined> | undefined} env
 */
function embedHeaders(env) {
	/** @type {Record<string, string>} */
	const headers = { 'content-type': 'application/json' };
	const token = String(env?.QVAC_BEARER_TOKEN || '').trim();
	if (token && !/[\r\n]/.test(token)) headers.authorization = `Bearer ${token}`;
	return headers;
}

/**
 * One vector per input, or null when QVAC cannot embed. A null slot means that
 * input was skipped. Callers keep the keyword document either way.
 * @param {Record<string, string | undefined> | undefined} env
 * @param {string[]} texts
 * @param {typeof fetch} [fetchImpl]
 * @param {number} [timeoutMs]
 * @returns {Promise<Array<number[] | null> | null>}
 */
export async function embedTexts(env, texts, fetchImpl = fetch, timeoutMs = 20000) {
	if (env?.QVAC_ENABLED !== 'true') return null;
	const upstream = classifyUpstream(env.QVAC_BASE_URL || env.QVAC_URL || '');
	if (!upstream.ok) return null;
	const dim = embedDimensions(env);
	const started = Date.now();
	try {
		const response = await fetchImpl(`${upstream.origin}/v1/embeddings`, {
			method: 'POST',
			headers: embedHeaders(env),
			body: JSON.stringify({
				model: embedModel(env),
				input: texts.map((text) => String(text || '').slice(0, 2000))
			}),
			signal: AbortSignal.timeout(timeoutMs)
		});
		if (!response.ok) {
			console.log(`qvac embed ${response.status} count=${texts.length} ms=${Date.now() - started}`);
			return null;
		}
		const payload = await response.json();
		const rows = Array.isArray(payload?.data) ? payload.data : null;
		if (!rows) return null;
		/** @type {Array<number[] | null>} */
		const vectors = texts.map(() => null);
		for (const row of rows) {
			const index = Number(row?.index);
			if (!Number.isInteger(index) || index < 0 || index >= vectors.length) continue;
			if (!isEmbedding(row?.embedding, dim)) continue;
			vectors[index] = row.embedding;
		}
		console.log(`qvac embed 200 count=${texts.length} ms=${Date.now() - started}`);
		return vectors;
	} catch {
		console.log(`qvac embed failed count=${texts.length} ms=${Date.now() - started}`);
		return null;
	}
}

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

/** Ollama-style routes first. The OpenAI route is the fallback. */
const EMBED_ROUTES = ['/api/embed', '/api/embeddings', '/v1/embeddings'];

/**
 * @param {string} route
 * @param {string} model
 * @param {string[]} texts
 */
function embedRequestBody(route, model, texts) {
	if (route === '/api/embeddings') return { model, prompt: texts[0] || '' };
	return { model, input: texts };
}

/**
 * @param {string} route
 * @param {unknown} payload
 * @param {string[]} texts
 * @param {number} dim
 * @returns {Array<number[] | null> | null}
 */
function vectorsFromPayload(route, payload, texts, dim) {
	if (!payload || typeof payload !== 'object') return null;
	const record = /** @type {{ embeddings?: unknown, embedding?: unknown, data?: unknown }} */ (
		payload
	);
	if (route === '/api/embed') {
		const rows = record.embeddings;
		if (!Array.isArray(rows)) return null;
		if (rows.length > 0 && typeof rows[0] === 'number') {
			return [isEmbedding(rows, dim) ? /** @type {number[]} */ (rows) : null];
		}
		return texts.map((_, index) => (isEmbedding(rows[index], dim) ? rows[index] : null));
	}
	if (route === '/api/embeddings') {
		return [isEmbedding(record.embedding, dim) ? /** @type {number[]} */ (record.embedding) : null];
	}
	const rows = Array.isArray(record.data) ? record.data : null;
	if (!rows) return null;
	/** @type {Array<number[] | null>} */
	const vectors = texts.map(() => null);
	for (const row of rows) {
		if (!row || typeof row !== 'object') continue;
		const item = /** @type {{ index?: unknown, embedding?: unknown }} */ (row);
		const index = Number(item.index);
		if (!Number.isInteger(index) || index < 0 || index >= vectors.length) continue;
		if (!isEmbedding(item.embedding, dim)) continue;
		vectors[index] = /** @type {number[]} */ (item.embedding);
	}
	return vectors;
}

/**
 * Prefer the embed alias, then an EmbeddingGemma model already on the server.
 * @param {Record<string, string | undefined> | undefined} env
 * @param {typeof fetch} [fetchImpl]
 */
export async function resolveEmbedModel(env, fetchImpl = fetch) {
	const configured = String(env?.QVAC_EMBED_MODEL || '').trim();
	if (configured) return configured;
	const upstream = classifyUpstream(env?.QVAC_BASE_URL || env?.QVAC_URL || '');
	if (!upstream.ok) return EMBED_MODEL;
	try {
		const response = await fetchImpl(`${upstream.origin}/api/tags`, {
			headers: embedHeaders(env),
			signal: AbortSignal.timeout(8000)
		});
		if (!response.ok) return EMBED_MODEL;
		const payload = await response.json();
		const rows = Array.isArray(payload?.models) ? payload.models : [];
		const names = rows
			.map((row) => (row && typeof row === 'object' ? String(row.name || row.model || '') : ''))
			.filter(Boolean);
		if (names.some((name) => name === 'embed' || name.startsWith('embed:'))) return 'embed';
		const gemma = names.find((name) => name.toLowerCase().includes('embeddinggemma'));
		return gemma || EMBED_MODEL;
	} catch {
		return EMBED_MODEL;
	}
}

/**
 * One vector per input, or null when QVAC cannot embed. A null slot means that
 * input was skipped. Callers keep the keyword document either way.
 * QVAC_EMBED_STRICT=true throws when every embed route returns 404.
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
	const model = embedModel(env);
	const inputs = texts.map((text) => String(text || '').slice(0, 2000));
	const started = Date.now();
	const strict = env.QVAC_EMBED_STRICT === 'true';
	try {
		let lastStatus = 0;
		for (const route of EMBED_ROUTES) {
			const batches = route === '/api/embeddings' ? inputs.map((text) => [text]) : [inputs];
			/** @type {Array<number[] | null>} */
			const vectors = [];
			let routeFailed = false;
			for (const batch of batches) {
				const response = await fetchImpl(`${upstream.origin}${route}`, {
					method: 'POST',
					headers: embedHeaders(env),
					body: JSON.stringify(embedRequestBody(route, model, batch)),
					signal: AbortSignal.timeout(timeoutMs)
				});
				lastStatus = response.status;
				if (!response.ok) {
					routeFailed = true;
					break;
				}
				const parsed = vectorsFromPayload(route, await response.json(), batch, dim);
				if (!parsed) {
					routeFailed = true;
					break;
				}
				vectors.push(...parsed);
			}
			if (!routeFailed) {
				console.log(
					`qvac embed 200 count=${texts.length} path=${route} ms=${Date.now() - started}`
				);
				return vectors;
			}
			if (lastStatus !== 404) break;
		}
		console.log(
			`qvac embed ${lastStatus || 'failed'} count=${texts.length} path=${EMBED_ROUTES.join(',')} ms=${Date.now() - started}`
		);
		if (strict && lastStatus === 404) {
			throw new Error(
				`Embedding alias ${model} is not loaded at ${upstream.origin}. Tried /api/embed, /api/embeddings, and /v1/embeddings (404). Play qvac-setup to pull EmbeddingGemma (768d).`
			);
		}
		return null;
	} catch (error) {
		if (strict && error instanceof Error && error.message.startsWith('Embedding alias ')) {
			throw error;
		}
		console.log(`qvac embed failed count=${texts.length} ms=${Date.now() - started}`);
		if (strict) {
			throw new Error(
				`Embedding alias ${model} is not loaded at ${upstream.origin}. Play qvac-setup to pull EmbeddingGemma (768d).`
			);
		}
		return null;
	}
}

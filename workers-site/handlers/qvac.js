/**
 * Sandbox proxy to a QVAC server Jon runs himself.
 * Logs the route, status, byte count, and duration. Never the text or the audio.
 */
import { AUDIO_LIMIT, IMAGE_LIMIT, TEXT_LIMIT, classifyUpstream } from '../../src/lib/qvac/gate.js';
import { categoryMessages, draftMessages } from '../../src/lib/qvac/prompts.js';
import { parseCategory, parseDraft } from '../../src/lib/qvac/parse.js';
import { handleAssistantRoute } from './assistant.js';

const DRAFT_FORMAT = {
	type: 'json_schema',
	json_schema: {
		name: 'listing_draft',
		strict: true,
		schema: {
			type: 'object',
			properties: {
				title: { type: 'string' },
				description: { type: 'string' },
				categoryId: { type: 'string' },
				price: { type: 'number' }
			},
			required: ['title', 'description', 'categoryId', 'price'],
			additionalProperties: false
		}
	}
};

const JSON_BODY_LIMIT = 32_000;
const UPSTREAM_BODY_LIMIT = 100_000;

function json(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
	});
}

function logCall(route, status, bytes, started) {
	console.log(`qvac ${route} ${status} bytes=${bytes} ms=${Date.now() - started}`);
}

function finish(route, status, bytes, started, body) {
	logCall(route, status, bytes, started);
	return json(status, body);
}

async function readJson(request) {
	const length = Number(request.headers.get('content-length') || 0);
	if (length > JSON_BODY_LIMIT) return { error: 'too_long' };
	const text = await request.text();
	if (text.length > JSON_BODY_LIMIT) return { error: 'too_long' };
	try {
		return { value: JSON.parse(text), bytes: text.length };
	} catch {
		return { error: 'failed' };
	}
}

async function readUpstream(response) {
	const text = await response.text();
	if (!response.ok || text.length > UPSTREAM_BODY_LIMIT) return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/**
 * QVAC_BASE_URL is the public origin. QVAC_URL remains an alias for local setups.
 * @param {{ QVAC_BASE_URL?: string, QVAC_URL?: string } | undefined} env
 */
function qvacBase(env) {
	return env?.QVAC_BASE_URL || env?.QVAC_URL || '';
}

/**
 * The bearer token stays on the worker. It is never logged and never returned.
 * @param {{ QVAC_BEARER_TOKEN?: string } | undefined} env
 * @param {Record<string, string>} [headers]
 */
function upstreamHeaders(env, headers = {}) {
	const next = { ...headers };
	const token = String(env?.QVAC_BEARER_TOKEN || '').trim();
	if (token && !/[\r\n]/.test(token)) next.authorization = `Bearer ${token}`;
	return next;
}

/**
 * @param {string} origin
 * @param {{ QVAC_BEARER_TOKEN?: string } | undefined} env
 * @param {unknown[]} messages
 * @param {number} maxTokens
 * @param {number} timeoutMs
 */
async function complete(origin, env, messages, maxTokens, timeoutMs, extra = {}) {
	const response = await fetch(`${origin}/v1/chat/completions`, {
		method: 'POST',
		headers: upstreamHeaders(env, { 'content-type': 'application/json' }),
		body: JSON.stringify({
			model: 'llama',
			temperature: 0,
			max_tokens: maxTokens,
			messages,
			...extra
		}),
		signal: AbortSignal.timeout(timeoutMs)
	});
	const payload = await readUpstream(response);
	const content = payload?.choices?.[0]?.message?.content;
	return typeof content === 'string' ? content : null;
}

/**
 * @param {Request} request
 * @param {{ QVAC_ENABLED?: string, QVAC_URL?: string, QVAC_BASE_URL?: string, QVAC_BEARER_TOKEN?: string }} env
 */
export async function handleQvacRoute(request, env) {
	const url = new URL(request.url);
	const route = url.pathname.replace(/^\/api\/qvac\//, '') || 'unknown';
	const started = Date.now();
	const bytes = Number(request.headers.get('content-length') || 0);

	if (env?.QVAC_ENABLED !== 'true')
		return finish(route, 404, bytes, started, { error: 'disabled' });
	if (route === 'assistant' && request.method === 'GET') {
		return handleAssistantRoute(request, env);
	}
	if (request.method !== 'POST') return finish(route, 404, bytes, started, { error: 'disabled' });

	const upstream = classifyUpstream(qvacBase(env));
	if (route === 'assistant') {
		if (!upstream.ok) {
			const status = upstream.reason === 'third_party' ? 403 : 503;
			const error = upstream.reason === 'third_party' ? 'refused' : 'unavailable';
			return finish(route, status, bytes, started, { error });
		}
		return handleAssistantRoute(request, env, { origin: upstream.origin });
	}
	if (!upstream.ok) {
		const status = upstream.reason === 'third_party' ? 403 : 503;
		const error = upstream.reason === 'third_party' ? 'refused' : 'unavailable';
		return finish(route, status, bytes, started, { error });
	}

	try {
		if (route === 'draft') return await draft(request, upstream.origin, env, bytes, started);
		if (route === 'category') return await category(request, upstream.origin, env, bytes, started);
		if (route === 'translate')
			return await translate(request, upstream.origin, env, bytes, started);
		if (route === 'transcribe')
			return await transcribe(request, upstream.origin, env, bytes, started);
		if (route === 'vision') return await vision(request, upstream.origin, env, bytes, started);
		return finish(route, 404, bytes, started, { error: 'disabled' });
	} catch {
		return finish(route, 502, bytes, started, { error: 'failed' });
	}
}

async function draft(request, origin, env, bytes, started) {
	const body = await readJson(request);
	if (body.error)
		return finish('draft', body.error === 'too_long' ? 413 : 400, bytes, started, {
			error: body.error
		});
	const text = String(body.value?.text || '').trim();
	const kind =
		body.value?.kind === 'listing'
			? 'listing'
			: body.value?.kind === 'service'
				? 'service'
				: 'task';
	const offer = body.value?.offer === 'rent' ? 'rent' : 'sell';
	if (!text) return finish('draft', 400, bytes, started, { error: 'failed' });
	if (text.length > TEXT_LIMIT) return finish('draft', 413, bytes, started, { error: 'too_long' });
	const content = await complete(origin, env, draftMessages(text, kind, offer), 400, 45_000, {
		response_format: DRAFT_FORMAT
	});
	const draftResult = parseDraft(content, { kind, offer });
	if (!draftResult.title) return finish('draft', 502, bytes, started, { error: 'unreadable' });
	return finish('draft', 200, bytes, started, draftResult);
}

async function category(request, origin, env, bytes, started) {
	const body = await readJson(request);
	if (body.error) {
		return finish('category', body.error === 'too_long' ? 413 : 400, bytes, started, {
			error: body.error
		});
	}
	const title = String(body.value?.title || '').trim();
	const description = String(body.value?.description || '').trim();
	if (title.length < 8) return finish('category', 200, bytes, started, { categoryId: '' });
	if (title.length + description.length > TEXT_LIMIT) {
		return finish('category', 413, bytes, started, { error: 'too_long' });
	}
	const content = await complete(
		origin,
		env,
		categoryMessages(title.slice(0, 200), description),
		64,
		20_000
	);
	return finish('category', 200, bytes, started, { categoryId: parseCategory(content) });
}

async function translate(request, origin, env, bytes, started) {
	const body = await readJson(request);
	if (body.error) {
		return finish('translate', body.error === 'too_long' ? 413 : 400, bytes, started, {
			error: body.error
		});
	}
	const text = String(body.value?.text || '').trim();
	const to = body.value?.to === 'en' ? 'en' : body.value?.to === 'es' ? 'es' : '';
	if (!text || !to) return finish('translate', 400, bytes, started, { error: 'failed' });
	if (text.length > TEXT_LIMIT)
		return finish('translate', 413, bytes, started, { error: 'too_long' });
	const response = await fetch(`${origin}/qvac/v1/translate`, {
		method: 'POST',
		headers: upstreamHeaders(env, { 'content-type': 'application/json' }),
		body: JSON.stringify({
			model: to === 'es' ? 'bergamot-en-es' : 'bergamot-es-en',
			text
		}),
		signal: AbortSignal.timeout(20_000)
	});
	const payload = await readUpstream(response);
	const translated = payload?.translations?.[0];
	if (typeof translated !== 'string' || !translated.trim()) {
		return finish('translate', 502, bytes, started, { error: 'unreadable' });
	}
	return finish('translate', 200, bytes, started, { text: translated, to });
}

/** A browser File and a worker Blob both qualify. instanceof File breaks across realms. */
function asUpload(value) {
	if (!value || typeof value !== 'object') return null;
	if (typeof value.size !== 'number' || typeof value.arrayBuffer !== 'function') return null;
	return value;
}

async function transcribe(request, origin, env, bytes, started) {
	if (bytes > AUDIO_LIMIT) return finish('transcribe', 413, bytes, started, { error: 'too_long' });
	const type = request.headers.get('content-type') || '';
	let file;
	if (type.includes('multipart/form-data')) {
		const form = await request.formData();
		const incoming = asUpload(form.get('file'));
		if (!incoming) return finish('transcribe', 400, bytes, started, { error: 'failed' });
		if (incoming.size > AUDIO_LIMIT) {
			return finish('transcribe', 413, incoming.size, started, { error: 'too_long' });
		}
		file = incoming;
	} else if (type.startsWith('audio/') || type.startsWith('video/')) {
		const audio = await request.arrayBuffer();
		if (audio.byteLength > AUDIO_LIMIT) {
			return finish('transcribe', 413, audio.byteLength, started, { error: 'too_long' });
		}
		file = new File([audio], 'speech.webm', { type: type.split(';')[0] || 'audio/webm' });
	} else {
		return finish('transcribe', 400, bytes, started, { error: 'failed' });
	}

	const audioBytes = new Uint8Array(await file.arrayBuffer());
	const outgoing = new FormData();
	outgoing.set(
		'file',
		new Blob([audioBytes], { type: file.type || 'audio/webm' }),
		file.name || 'speech.webm'
	);
	outgoing.set('model', 'whisper');
	outgoing.set('response_format', 'json');
	const response = await fetch(`${origin}/v1/audio/transcriptions`, {
		method: 'POST',
		headers: upstreamHeaders(env),
		body: outgoing,
		signal: AbortSignal.timeout(45_000)
	});
	const payload = await readUpstream(response);
	const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
	if (!text) return finish('transcribe', 502, file.size, started, { error: 'unreadable' });
	return finish('transcribe', 200, file.size, started, { text });
}

function bytesToBase64(bytes) {
	let binary = '';
	const size = 0x8000;
	for (let index = 0; index < bytes.length; index += size) {
		binary += String.fromCharCode(...bytes.subarray(index, index + size));
	}
	return btoa(binary);
}

function textFromOcr(payload) {
	if (typeof payload?.text === 'string' && payload.text.trim()) return payload.text.trim();
	if (Array.isArray(payload?.blocks)) {
		const joined = payload.blocks
			.map((block) => (typeof block?.text === 'string' ? block.text.trim() : ''))
			.filter(Boolean)
			.join('\n')
			.trim();
		if (joined) return joined;
	}
	return '';
}

/**
 * OCR first. A vision chat model is used only when QVAC_VISION_MODEL is set,
 * because the default chat route drops image parts.
 */
async function readImageText(origin, env, bytes, mime) {
	const image = bytesToBase64(bytes);
	const model = String(env.QVAC_OCR_MODEL || 'ocr').trim() || 'ocr';
	for (const path of ['/qvac/v1/ocr', '/v1/ocr']) {
		try {
			const response = await fetch(`${origin}${path}`, {
				method: 'POST',
				headers: upstreamHeaders(env, { 'content-type': 'application/json' }),
				body: JSON.stringify({ model, image }),
				signal: AbortSignal.timeout(45_000)
			});
			if (!response.ok) continue;
			const text = textFromOcr(await response.json());
			if (text) return text.slice(0, TEXT_LIMIT);
		} catch {
			// Try the next OCR path, then the optional vision model.
		}
	}
	const vision = String(env.QVAC_VISION_MODEL || '').trim();
	if (!vision) return '';
	try {
		const response = await fetch(`${origin}/v1/chat/completions`, {
			method: 'POST',
			headers: upstreamHeaders(env, { 'content-type': 'application/json' }),
			body: JSON.stringify({
				model: vision,
				temperature: 0,
				max_tokens: 400,
				messages: [
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: 'Describe this photo for a BitTasker listing. Include any words you can read. Spanish or English is fine.'
							},
							{ type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } }
						]
					}
				]
			}),
			signal: AbortSignal.timeout(45_000)
		});
		if (!response.ok) return '';
		const payload = await response.json();
		const content = payload?.choices?.[0]?.message?.content;
		return typeof content === 'string' ? content.trim().slice(0, TEXT_LIMIT) : '';
	} catch {
		return '';
	}
}

async function vision(request, origin, env, bytes, started) {
	if (bytes > IMAGE_LIMIT) return finish('vision', 413, bytes, started, { error: 'too_long' });
	const type = request.headers.get('content-type') || '';
	if (!type.includes('multipart/form-data')) {
		return finish('vision', 400, bytes, started, { error: 'failed' });
	}
	const form = await request.formData();
	const incoming = asUpload(form.get('file'));
	if (!incoming) return finish('vision', 400, bytes, started, { error: 'failed' });
	if (incoming.size > IMAGE_LIMIT) {
		return finish('vision', 413, incoming.size, started, { error: 'too_long' });
	}
	const mime = String(incoming.type || 'image/jpeg').split(';')[0];
	if (!mime.startsWith('image/'))
		return finish('vision', 400, incoming.size, started, { error: 'failed' });
	const kind =
		form.get('kind') === 'listing'
			? 'listing'
			: form.get('kind') === 'service'
				? 'service'
				: 'task';
	const offer = form.get('offer') === 'rent' ? 'rent' : 'sell';
	const imageBytes = new Uint8Array(await incoming.arrayBuffer());
	const seen = await readImageText(origin, env, imageBytes, mime);
	if (!seen) return finish('vision', 502, incoming.size, started, { error: 'unreadable' });
	const content = await complete(origin, env, draftMessages(seen, kind, offer), 400, 45_000, {
		response_format: DRAFT_FORMAT
	});
	const draftResult = parseDraft(content, { kind, offer });
	if (!draftResult.title)
		return finish('vision', 502, incoming.size, started, { error: 'unreadable' });
	return finish('vision', 200, incoming.size, started, draftResult);
}

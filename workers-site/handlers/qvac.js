/**
 * Sandbox proxy to a QVAC server Jon runs himself.
 * Logs the route, status, byte count, and duration. Never the text or the audio.
 */
import { AUDIO_LIMIT, TEXT_LIMIT, classifyUpstream } from '../../src/lib/qvac/gate.js';
import { categoryMessages, draftMessages } from '../../src/lib/qvac/prompts.js';
import { parseCategory, parseDraft } from '../../src/lib/qvac/parse.js';

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
 * @param {string} origin
 * @param {unknown[]} messages
 * @param {number} maxTokens
 * @param {number} timeoutMs
 */
async function complete(origin, messages, maxTokens, timeoutMs) {
	const response = await fetch(`${origin}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			model: 'llama',
			temperature: 0,
			max_tokens: maxTokens,
			messages
		}),
		signal: AbortSignal.timeout(timeoutMs)
	});
	const payload = await readUpstream(response);
	const content = payload?.choices?.[0]?.message?.content;
	return typeof content === 'string' ? content : null;
}

/**
 * @param {Request} request
 * @param {{ QVAC_ENABLED?: string, QVAC_URL?: string }} env
 */
export async function handleQvacRoute(request, env) {
	const url = new URL(request.url);
	const route = url.pathname.replace(/^\/api\/qvac\//, '') || 'unknown';
	const started = Date.now();
	const bytes = Number(request.headers.get('content-length') || 0);

	if (env?.QVAC_ENABLED !== 'true')
		return finish(route, 404, bytes, started, { error: 'disabled' });
	if (request.method !== 'POST') return finish(route, 404, bytes, started, { error: 'disabled' });

	const upstream = classifyUpstream(env.QVAC_URL);
	if (!upstream.ok) {
		const status = upstream.reason === 'third_party' ? 403 : 503;
		const error = upstream.reason === 'third_party' ? 'refused' : 'unavailable';
		return finish(route, status, bytes, started, { error });
	}

	try {
		if (route === 'draft') return await draft(request, upstream.origin, bytes, started);
		if (route === 'category') return await category(request, upstream.origin, bytes, started);
		if (route === 'translate') return await translate(request, upstream.origin, bytes, started);
		if (route === 'transcribe') return await transcribe(request, upstream.origin, bytes, started);
		return finish(route, 404, bytes, started, { error: 'disabled' });
	} catch {
		return finish(route, 502, bytes, started, { error: 'failed' });
	}
}

async function draft(request, origin, bytes, started) {
	const body = await readJson(request);
	if (body.error)
		return finish('draft', body.error === 'too_long' ? 413 : 400, bytes, started, {
			error: body.error
		});
	const text = String(body.value?.text || '').trim();
	if (!text) return finish('draft', 400, bytes, started, { error: 'failed' });
	if (text.length > TEXT_LIMIT) return finish('draft', 413, bytes, started, { error: 'too_long' });
	const content = await complete(origin, draftMessages(text), 400, 45_000);
	const draftResult = parseDraft(content);
	if (!draftResult.title) return finish('draft', 502, bytes, started, { error: 'unreadable' });
	return finish('draft', 200, bytes, started, draftResult);
}

async function category(request, origin, bytes, started) {
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
		categoryMessages(title.slice(0, 200), description),
		64,
		20_000
	);
	return finish('category', 200, bytes, started, { categoryId: parseCategory(content) });
}

async function translate(request, origin, bytes, started) {
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
		headers: { 'content-type': 'application/json' },
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

async function transcribe(request, origin, bytes, started) {
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
		body: outgoing,
		signal: AbortSignal.timeout(45_000)
	});
	const payload = await readUpstream(response);
	const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
	if (!text) return finish('transcribe', 502, file.size, started, { error: 'unreadable' });
	return finish('transcribe', 200, file.size, started, { text });
}

/**
 * BitTasker Assistant. The nsec is ASSISTANT_NSEC on the worker.
 * This file never logs the secret, the note, or the reply.
 */
import { extractJson } from '../../src/lib/qvac/parse.js';
import {
	assistantMessages,
	limitLinks,
	nudgeFor,
	refusal,
	safeOrigin,
	safeRoute,
	takeRateLimit
} from '../../src/lib/qvac/assistant-core.js';
import {
	keysFromNsec,
	publishToRelays,
	readAssistantDm,
	signAssistantReply
} from '../../src/lib/qvac/assistant-dm.js';

/**
 * Same relays the app uses for kind 4 chat, in try order.
 * Sandbox chat is wss://relay2.bittasker.com. nos.lol and damus are fallbacks
 * and are used only when the earlier relay does not accept the event.
 * ASSISTANT_RELAYS overrides this. The nsec is never part of the list.
 * @param {Record<string, string | undefined>} env
 */
export function assistantRelays(env) {
	const configured = String(env.ASSISTANT_RELAYS || '')
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.startsWith('ws://') || item.startsWith('wss://'));
	if (configured.length) return configured;
	if (
		env.VITE_CLIENT_HOSTNAME === 'rgb.bittasker.com' ||
		env.TYPESENSE_COLLECTION_PREFIX === 'rgb_'
	) {
		return ['wss://relay2.bittasker.com', 'wss://nos.lol', 'wss://relay.damus.io'];
	}
	return ['wss://relay1.bittasker.com', 'wss://nos.lol', 'wss://relay.damus.io'];
}

const buckets = new Map();

export function resetAssistantLimits() {
	buckets.clear();
}

function json(status, body) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
	});
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {unknown[]} messages
 * @param {string} origin
 */
async function complete(env, messages, origin) {
	const headers = { 'content-type': 'application/json' };
	const token = String(env.QVAC_BEARER_TOKEN || '').trim();
	if (token && !/[\r\n]/.test(token)) headers.authorization = `Bearer ${token}`;
	const response = await fetch(`${origin}/v1/chat/completions`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			model: 'llama',
			temperature: 0,
			max_tokens: 400,
			messages,
			response_format: {
				type: 'json_schema',
				json_schema: {
					name: 'assistant_reply',
					strict: true,
					schema: {
						type: 'object',
						properties: { reply: { type: 'string' } },
						required: ['reply'],
						additionalProperties: false
					}
				}
			}
		}),
		signal: AbortSignal.timeout(45_000)
	});
	if (!response.ok) return '';
	const payload = await response.json();
	const content = payload?.choices?.[0]?.message?.content;
	return typeof content === 'string' ? content : '';
}

/**
 * @param {Request} request
 * @param {Record<string, string | undefined>} env
 * @param {{ origin?: string, publish?: (relays: string[], event: Record<string, unknown>) => Promise<boolean>, now?: number }} [deps]
 */
export async function handleAssistantRoute(request, env, deps = {}) {
	const started = Date.now();
	const keys = keysFromNsec(env.ASSISTANT_NSEC);
	if (request.method === 'GET') {
		if (!keys) return json(503, { error: 'unavailable' });
		console.log(`qvac assistant info 200 ms=${Date.now() - started}`);
		return json(200, { pubkey: keys.pubkey, name: 'BitTasker Assistant' });
	}
	if (request.method !== 'POST') return json(404, { error: 'disabled' });
	if (!keys) return json(503, { error: 'unavailable' });
	if (!deps.origin) return json(503, { error: 'unavailable' });

	let body;
	try {
		body = await request.json();
	} catch {
		return json(400, { error: 'failed' });
	}
	const opened = await readAssistantDm(body?.event, keys.pubkey, keys.secret);
	if ('error' in opened) return json(400, { error: 'rejected' });
	const now = deps.now ?? Date.now();
	if (!takeRateLimit(opened.sender, now, buckets)) {
		console.log(`qvac assistant limited ms=${Date.now() - started}`);
		return json(429, { error: 'limited' });
	}

	const language = body?.language === 'es' ? 'es' : 'en';
	const route = safeRoute(body?.route);
	const origin = safeOrigin(body?.origin);
	const nudge = nudgeFor(route, language);
	const link = origin ? `${origin}${nudge.path}` : nudge.path;
	const canned = refusal(opened.text, language);
	let reply = canned;
	if (!reply) {
		try {
			const raw = await complete(
				env,
				[
					...assistantMessages({ language, route, origin: origin || '', nudge }),
					{ role: 'user', content: opened.text }
				],
				deps.origin
			);
			const parsed = extractJson(raw);
			reply = typeof parsed?.reply === 'string' ? parsed.reply.trim() : '';
		} catch {
			reply = '';
		}
	}
	if (!reply) return json(502, { error: 'unreadable' });
	reply = limitLinks(reply, link).slice(0, 2000);

	let signed;
	try {
		signed = await signAssistantReply(keys.secret, opened.sender, reply);
	} catch {
		return json(502, { error: 'failed' });
	}
	const relays = assistantRelays(env);
	const publish = deps.publish || publishToRelays;
	const delivered = await publish(relays, signed).catch(() => false);
	console.log(`qvac assistant ${delivered ? 200 : 502} ms=${Date.now() - started}`);
	if (!delivered) return json(502, { error: 'failed' });
	return json(200, { text: reply, eventId: signed.id });
}

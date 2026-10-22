/** Limits and upstream checks for the sandbox QVAC proxy. No user text is logged. */

export const TEXT_LIMIT = 4000;
export const AUDIO_LIMIT = 8 * 1024 * 1024;
export const IMAGE_LIMIT = 4 * 1024 * 1024;

/** Hosts that would send a listing or a voice note to someone else's model. */
const BLOCKED_SUFFIXES = [
	'openai.com',
	'anthropic.com',
	'googleapis.com',
	'groq.com',
	'mistral.ai',
	'openrouter.ai',
	'together.ai',
	'together.xyz',
	'fireworks.ai',
	'cohere.ai',
	'cohere.com',
	'deepseek.com',
	'x.ai',
	'huggingface.co',
	'hf.co',
	'replicate.com',
	'perplexity.ai'
];

/**
 * @param {string} host
 */
function blockedHost(host) {
	const name = host.toLowerCase().replace(/\.$/, '');
	return BLOCKED_SUFFIXES.some((suffix) => name === suffix || name.endsWith(`.${suffix}`));
}

/**
 * Accept only an origin Jon runs himself. A path, a query, or a known model API is refused.
 * @param {unknown} value
 * @returns {{ ok: true, origin: string } | { ok: false, reason: 'missing' | 'invalid' | 'third_party' }}
 */
export function classifyUpstream(value) {
	if (typeof value !== 'string' || value.trim() === '') return { ok: false, reason: 'missing' };
	let url;
	try {
		url = new URL(value.trim());
	} catch {
		return { ok: false, reason: 'invalid' };
	}
	if (url.username || url.password) return { ok: false, reason: 'invalid' };
	if (url.protocol !== 'http:' && url.protocol !== 'https:')
		return { ok: false, reason: 'invalid' };
	if (url.search || url.hash) return { ok: false, reason: 'invalid' };
	if (blockedHost(url.hostname)) return { ok: false, reason: 'third_party' };
	if (url.pathname !== '/' && url.pathname !== '') return { ok: false, reason: 'invalid' };
	return { ok: true, origin: url.origin };
}

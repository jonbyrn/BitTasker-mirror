/** Prompt, safety, and nudge rules for the BitTasker Assistant. No keys. */

const FEATURES = [
	'Post a task: /create-task',
	'Browse tasks: /tasks',
	'Browse services: /services',
	'List a service to get hired: /create-service',
	'Temp staff shifts: /shifts and post one at /shifts/new',
	'Buy & Sell: /browse/goods and list one at /browse/goods/new',
	'Wallet and USDT: /wallet',
	'Escrow holds a payment until the people agree to release it. The assistant cannot fund, release, or sign.',
	'Direct messages: /messages',
	'Profile: /profile'
].join('\n');

/**
 * @param {string} route
 * @param {'en' | 'es'} language
 */
export function nudgeFor(route, language) {
	const path = String(route || '/').split('?')[0];
	const spanish = language === 'es';
	/** @type {{ path: string, label: string }} */
	let nudge = {
		path: '/create-task',
		label: spanish ? 'Publica una tarea' : 'Post a task'
	};
	if (path.startsWith('/wallet')) {
		nudge = { path: '/wallet', label: spanish ? 'Carga tu wallet' : 'Fund your wallet' };
	} else if (path.startsWith('/browse/goods/new')) {
		nudge = { path: '/wallet', label: spanish ? 'Carga tu wallet' : 'Fund your wallet' };
	} else if (path.startsWith('/browse/goods')) {
		nudge = {
			path: '/browse/goods/new',
			label: spanish ? 'Publica un artículo o un alquiler' : 'List an item or a rental'
		};
	} else if (path.startsWith('/create-service')) {
		nudge = { path: '/tasks', label: spanish ? 'Mira tareas' : 'Browse tasks' };
	} else if (path.startsWith('/services')) {
		nudge = {
			path: '/create-service',
			label: spanish ? 'Publica un servicio para que te contraten' : 'List a service to get hired'
		};
	} else if (path.startsWith('/shifts/new')) {
		nudge = { path: '/wallet', label: spanish ? 'Carga tu wallet' : 'Fund your wallet' };
	} else if (path.startsWith('/shifts')) {
		nudge = {
			path: '/shifts/new',
			label: spanish ? 'Reserva personal temporal' : 'Book temp staff'
		};
	} else if (path.startsWith('/profile')) {
		nudge = {
			path: '/profile',
			label: spanish ? 'Completa y comparte tu perfil' : 'Complete and share your profile'
		};
	} else if (path.startsWith('/create-task')) {
		nudge = {
			path: '/create-service',
			label: spanish ? 'Publica un servicio para que te contraten' : 'List a service to get hired'
		};
	} else if (path.startsWith('/tasks')) {
		nudge = { path: '/create-task', label: spanish ? 'Publica una tarea' : 'Post a task' };
	} else if (path.startsWith('/messages')) {
		nudge = { path: '/create-task', label: spanish ? 'Publica una tarea' : 'Post a task' };
	}
	return nudge;
}

/**
 * @param {unknown} value
 */
export function safeOrigin(value) {
	if (typeof value !== 'string' || !value.trim()) return '';
	let url;
	try {
		url = new URL(value.trim());
	} catch {
		return '';
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
	const host = url.hostname.toLowerCase();
	const local = host === 'localhost' || host === '127.0.0.1';
	const owned = host === 'bittasker.com' || host.endsWith('.bittasker.com');
	if (!local && !owned) return '';
	return url.origin;
}

/**
 * @param {unknown} value
 */
export function safeRoute(value) {
	const route = String(value || '')
		.split('?')[0]
		.trim();
	if (!route.startsWith('/') || route.startsWith('//') || route.includes('://')) return '/';
	if (route.length > 120) return route.slice(0, 120);
	return route;
}

/**
 * A canned refusal for requests the assistant must not answer.
 * Empty means the model may answer.
 * @param {string} text
 * @param {'en' | 'es'} language
 */
export function refusal(text, language) {
	const source = String(text || '');
	const folded = source.toLowerCase();
	const secret =
		/(nsec1|seed phrase|mnemonic|passkey|private key|clave privada|frase semilla|palabras semilla)/i.test(
			source
		);
	const funds =
		/(send (me )?(the )?(btc|bitcoin|usdt|sats|money|funds)|sign (this|the) (tx|transaction|psbt)|move (my )?funds|firma (esta|la) transacci)/i.test(
			folded
		);
	const jailbreak =
		/ignore (all |any )?(previous|prior|your) instructions|reveal (the |your )?system prompt/i.test(
			folded
		);
	const abuse = /(child sexual|csam|ransomware|how to hack|build a bomb)/i.test(folded);
	if (!secret && !funds && !jailbreak && !abuse) return '';
	if (language === 'es') {
		return 'No puedo hacer eso. Te explico cómo usar BitTasker y tú haces la acción. Nunca compartas tu nsec, tu semilla ni tu passkey.';
	}
	return 'I can’t do that. I can explain how BitTasker works, and you take the action. Never share your nsec, seed, or passkey.';
}

/**
 * @param {string} reply
 */
export function mentionsSecretRequest(reply) {
	return /(send me|share|paste|enter|dime|pega|escribe).{0,40}(nsec|seed|semilla|passkey|private key|clave privada)/i.test(
		reply
	);
}

/**
 * Keep at most the one allowed link, and add it when the model forgot.
 * @param {string} reply
 * @param {string} allowedUrl
 */
export function limitLinks(reply, allowedUrl) {
	let text = String(reply || '').trim();
	if (mentionsSecretRequest(text)) {
		text =
			'I can explain the screens and give you a link. I will never ask for your nsec, seed, or passkey.';
	}
	const urls = text.match(/https?:\/\/[^\s)]+/g) || [];
	for (const url of urls) {
		const clean = url.replace(/[.,]$/, '');
		if (clean !== allowedUrl) text = text.replace(url, '');
	}
	text = text
		.replace(/[ \t]{2,}/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
	if (allowedUrl && !text.includes(allowedUrl)) {
		text = `${text}\n${allowedUrl}`.trim();
	}
	return text;
}

/**
 * @param {{ language: 'en' | 'es', route: string, origin: string, nudge: { path: string, label: string } }} input
 */
export function assistantMessages(input) {
	const spanish = input.language === 'es';
	const link = `${input.origin}${input.nudge.path}`;
	return [
		{
			role: 'system',
			content: [
				'You are the BitTasker Assistant inside the BitTasker app.',
				spanish ? 'Reply in Spanish.' : 'Reply in English.',
				'Answer only questions about using BitTasker. If the question is off topic, refuse in one friendly sentence and point back to the app.',
				'You never move funds, sign, post a listing, accept a bid, or release escrow. You only explain and link. The person acts.',
				'You never ask for an nsec, seed phrase, mnemonic, or passkey.',
				'Use only these real features:',
				FEATURES,
				`The person is on ${input.route}.`,
				`Add at most one nudge, tied to this page: ${input.nudge.label}. The only URL you may include is ${link}.`,
				'Reply with one JSON object and nothing else: {"reply":"..."}.'
			].join('\n')
		}
	];
}

/**
 * @param {string} sender
 * @param {number} now
 * @param {Map<string, number[]>} buckets
 * @param {number} [limit]
 * @param {number} [windowMs]
 */
export function takeRateLimit(sender, now, buckets, limit = 8, windowMs = 10 * 60 * 1000) {
	const key = String(sender || '').toLowerCase();
	const recent = (buckets.get(key) || []).filter((time) => now - time < windowMs);
	if (recent.length >= limit) {
		buckets.set(key, recent);
		return false;
	}
	recent.push(now);
	buckets.set(key, recent);
	return true;
}

/**
 * Pin the assistant thread first and label it, even before the first message.
 * @template T
 * @param {T[]} conversations
 * @param {string} pubkey
 * @param {string} name
 * @param {(pubkey: string, name: string) => T} placeholder
 */
export function pinAssistant(conversations, pubkey, name, placeholder) {
	const hex = String(pubkey || '').toLowerCase();
	if (!hex) return conversations;
	const rows = conversations.map((row) => {
		const id = String(/** @type {{ pubkey?: string }} */ (row).pubkey || '').toLowerCase();
		if (id !== hex) return row;
		const profile =
			/** @type {{ profile?: { name?: string, picture?: string } }} */ (row).profile || {};
		return {
			...row,
			profile: { ...profile, name }
		};
	});
	const index = rows.findIndex(
		(row) => String(/** @type {{ pubkey?: string }} */ (row).pubkey || '').toLowerCase() === hex
	);
	if (index === 0) return rows;
	if (index > 0) {
		const next = rows.slice();
		const [row] = next.splice(index, 1);
		next.unshift(row);
		return next;
	}
	return [placeholder(hex, name), ...rows];
}

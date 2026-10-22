/**
 * Kind 4 direct messages, the same shape the app already sends.
 * The body is NIP-44. Older NIP-04 notes still open. The nsec stays with the caller.
 */
import { finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools/pure';
import { nip04, nip19, nip44 } from 'nostr-tools';

/**
 * @param {unknown} value
 * @returns {{ secret: Uint8Array, pubkey: string } | null}
 */
export function keysFromNsec(value) {
	const encoded = String(value || '').trim();
	if (!encoded) return null;
	try {
		const decoded = nip19.decode(encoded);
		if (decoded.type !== 'nsec') return null;
		const secret = decoded.data;
		if (!(secret instanceof Uint8Array) || secret.length !== 32) return null;
		return { secret, pubkey: getPublicKey(secret) };
	} catch {
		return null;
	}
}

/**
 * @param {Uint8Array} secret
 * @param {string} otherPubkey
 * @param {string} ciphertext
 */
async function openNote(secret, otherPubkey, ciphertext) {
	try {
		const conversationKey = await nip44.getConversationKey(secret, otherPubkey);
		return await nip44.decrypt(ciphertext, conversationKey);
	} catch {
		const hex = [...secret].map((byte) => byte.toString(16).padStart(2, '0')).join('');
		return nip04.decrypt(hex, otherPubkey, ciphertext);
	}
}

/**
 * @param {unknown} event
 * @param {string} assistantPubkey
 * @param {Uint8Array} secret
 * @returns {Promise<{ sender: string, text: string } | { error: 'rejected' }>}
 */
export async function readAssistantDm(event, assistantPubkey, secret) {
	if (!event || typeof event !== 'object') return { error: 'rejected' };
	const note = /** @type {Record<string, any>} */ (event);
	if (note.kind !== 4) return { error: 'rejected' };
	if (typeof note.pubkey !== 'string' || typeof note.content !== 'string')
		return { error: 'rejected' };
	if (!verifyEvent(/** @type {any} */ (note))) return { error: 'rejected' };
	const sender = note.pubkey.toLowerCase();
	if (sender === assistantPubkey.toLowerCase()) return { error: 'rejected' };
	const tagged = (note.tags || []).some(
		(tag) =>
			Array.isArray(tag) &&
			tag[0] === 'p' &&
			String(tag[1] || '').toLowerCase() === assistantPubkey.toLowerCase()
	);
	if (!tagged) return { error: 'rejected' };
	if (note.content.length > 16_000) return { error: 'rejected' };
	try {
		const text = (await openNote(secret, sender, note.content)).trim();
		if (!text) return { error: 'rejected' };
		return { sender, text: text.slice(0, 4000) };
	} catch {
		return { error: 'rejected' };
	}
}

/**
 * @param {Uint8Array} secret
 * @param {string} recipient
 * @param {string} text
 */
export async function signAssistantReply(secret, recipient, text) {
	const conversationKey = await nip44.getConversationKey(secret, recipient);
	const nonce = crypto.getRandomValues(new Uint8Array(32));
	const content = await nip44.encrypt(text, conversationKey, nonce);
	return finalizeEvent(
		{
			kind: 4,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['p', recipient],
				['m', 'direct-message']
			],
			content
		},
		secret
	);
}

/**
 * @param {string} url
 * @param {Record<string, unknown>} event
 * @param {number} timeoutMs
 */
async function publishOne(url, event, timeoutMs) {
	const socket = new WebSocket(url);
	try {
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
			socket.addEventListener('open', () => {
				socket.send(JSON.stringify(['EVENT', event]));
			});
			socket.addEventListener('message', (message) => {
				try {
					const data = JSON.parse(String(message.data));
					if (data[0] === 'OK' && data[1] === event.id) {
						clearTimeout(timer);
						if (data[2] === true) resolve(true);
						else reject(new Error('rejected'));
					}
				} catch {
					// A relay notice is not an acceptance.
				}
			});
			socket.addEventListener('error', () => {
				clearTimeout(timer);
				reject(new Error('relay'));
			});
		});
		return true;
	} finally {
		socket.close();
	}
}

/**
 * Try relays in order. The first acceptance wins, so later URLs are fallbacks.
 * @param {string[]} relays
 * @param {Record<string, unknown>} event
 */
export async function publishToRelays(relays, event) {
	for (const url of relays) {
		const accepted = await publishOne(url, event, 8000).catch(() => false);
		if (accepted) return true;
	}
	return false;
}

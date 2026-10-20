/**
 * Authorization for /api/search/documents.
 * A write is accepted only when a fresh, valid Nostr signature covers the
 * listing id and the signer is the listing author.
 */

import { getEventHash, verifyEvent } from 'nostr-tools/pure';
import { decode as decodeNip19 } from 'nostr-tools/nip19';

const MAX_AGE_SECONDS = 15 * 60;
const MAX_FUTURE_SECONDS = 2 * 60;
const WINDOW_MS = 60_000;
const IP_LIMIT = 30;
const PUBKEY_LIMIT = 20;

const buckets = new Map();

export function authorHex(npubOrHex) {
	if (typeof npubOrHex !== 'string') return null;
	const value = npubOrHex.trim();
	if (/^[0-9a-fA-F]{64}$/.test(value)) return value.toLowerCase();
	if (!value.startsWith('npub1')) return null;
	try {
		const decoded = decodeNip19(value);
		if (decoded.type !== 'npub' || typeof decoded.data !== 'string') return null;
		return decoded.data.toLowerCase();
	} catch {
		return null;
	}
}

function tagValues(event, name) {
	if (!Array.isArray(event?.tags)) return [];
	return event.tags
		.filter((tag) => Array.isArray(tag) && tag[0] === name && typeof tag[1] === 'string')
		.map((tag) => tag[1]);
}

export function eventFresh(event, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!event || typeof event.created_at !== 'number' || !Number.isFinite(event.created_at)) {
		return false;
	}
	if (event.created_at > nowSeconds + MAX_FUTURE_SECONDS) return false;
	if (nowSeconds - event.created_at > MAX_AGE_SECONDS) return false;
	return true;
}

function invalid(status, error) {
	return { ok: false, status, error };
}

function verifyFresh(event, nowSeconds) {
	if (!event || typeof event !== 'object') {
		return invalid(401, 'A signed Nostr event is required');
	}
	// verifyEvent checks the signature against the id. Also require the id to be
	// the hash of this payload so a copied signature cannot authorize new content.
	try {
		if (typeof event.id !== 'string' || getEventHash(event) !== event.id || !verifyEvent(event)) {
			return invalid(401, 'Invalid Nostr event');
		}
	} catch {
		return invalid(401, 'Invalid Nostr event');
	}
	if (!eventFresh(event, nowSeconds)) return invalid(401, 'Signed event is expired');
	return null;
}

/**
 * POST: the event must not be a deletion, each document id must be in a d or e
 * tag, and each document author must be the signer.
 */
export function authorizeDocuments(event, documents, nowSeconds = Math.floor(Date.now() / 1000)) {
	const rejected = verifyFresh(event, nowSeconds);
	if (rejected) return rejected;
	if (event.kind === 5) return invalid(403, 'Event kind cannot change this index');
	if (!Array.isArray(documents) || documents.length === 0) {
		return invalid(400, 'No documents');
	}

	const allowed = new Set([...tagValues(event, 'd'), ...tagValues(event, 'e')]);
	const pubkey = String(event.pubkey).toLowerCase();
	for (const document of documents) {
		const id = document?.id;
		if (typeof id !== 'string' || !allowed.has(id)) {
			return invalid(403, 'Event does not cover this listing');
		}
		const author = authorHex(document.npub);
		if (!author || author !== pubkey) {
			return invalid(403, 'Pubkey does not match the listing author');
		}
	}
	return { ok: true, pubkey };
}

/**
 * DELETE: kind 5, and every id must be named by a d or e tag.
 * The stored author is checked separately once the document is loaded.
 */
export function authorizeDeletion(event, ids, nowSeconds = Math.floor(Date.now() / 1000)) {
	const rejected = verifyFresh(event, nowSeconds);
	if (rejected) return rejected;
	if (event.kind !== 5) return invalid(403, 'Event kind cannot change this index');
	if (!Array.isArray(ids) || ids.length === 0) return invalid(400, 'No documents');

	const allowed = new Set([...tagValues(event, 'd'), ...tagValues(event, 'e')]);
	for (const id of ids) {
		if (typeof id !== 'string' || !allowed.has(id)) {
			return invalid(403, 'Event does not cover this listing');
		}
	}
	return { ok: true, pubkey: String(event.pubkey).toLowerCase() };
}

function consume(key, limit, now) {
	let bucket = buckets.get(key);
	if (!bucket || now - bucket.start >= WINDOW_MS) {
		bucket = { start: now, count: 0 };
		buckets.set(key, bucket);
	}
	bucket.count += 1;
	if (buckets.size > 500) {
		for (const [bucketKey, value] of buckets) {
			if (now - value.start >= WINDOW_MS * 2) buckets.delete(bucketKey);
		}
	}
	return bucket.count <= limit;
}

export function clientIp(request) {
	const header =
		request?.headers?.get?.('cf-connecting-ip') ||
		request?.headers?.get?.('x-forwarded-for') ||
		'unknown';
	return String(header).split(',')[0].trim() || 'unknown';
}

/** Fixed one-minute windows: 30 writes per IP and 20 per pubkey. */
export function rateLimitWrite(request, pubkey, now = Date.now()) {
	const ipAllowed = consume(`ip:${clientIp(request)}`, IP_LIMIT, now);
	const pubkeyAllowed = consume(`pk:${String(pubkey).toLowerCase()}`, PUBKEY_LIMIT, now);
	return ipAllowed && pubkeyAllowed;
}

export function resetRateLimits() {
	buckets.clear();
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import {
	authorizeDeletion,
	authorizeDocuments,
	authorHex,
	rateLimitWrite,
	resetRateLimits
} from '../../../../../workers-site/handlers/search-auth.js';
import {
	handleSearchRoute,
	resetSearchState
} from '../../../../../workers-site/handlers/search.js';

function signedEvent(secret: Uint8Array, fields: Record<string, unknown> = {}) {
	const now = Math.floor(Date.now() / 1000);
	return finalizeEvent(
		{
			kind: 30000,
			created_at: now,
			tags: [['d', 'listing-1']],
			content: 'listing',
			...fields
		},
		secret
	);
}

describe('search document authorization', () => {
	const secret = generateSecretKey();
	const pubkey = getPublicKey(secret);
	const npub = npubEncode(pubkey);

	afterEach(() => {
		resetRateLimits();
		resetSearchState();
		vi.unstubAllGlobals();
	});

	it('decodes npub and hex authors to the same pubkey', () => {
		expect(authorHex(npub)).toBe(pubkey);
		expect(authorHex(pubkey.toUpperCase())).toBe(pubkey);
		expect(authorHex('not-a-key')).toBeNull();
	});

	it('accepts a fresh event whose signer matches the listing author and id', () => {
		const event = signedEvent(secret);
		const decision = authorizeDocuments(event, [{ id: 'listing-1', npub }]);
		expect(decision.ok).toBe(true);
		if (decision.ok) expect(decision.pubkey).toBe(pubkey);
	});

	it('rejects a signature that names a different listing', () => {
		const event = signedEvent(secret);
		const decision = authorizeDocuments(event, [{ id: 'listing-2', npub }]);
		expect(decision).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects a signer who is not the listing author', () => {
		const other = getPublicKey(generateSecretKey());
		const event = signedEvent(secret);
		const decision = authorizeDocuments(event, [{ id: 'listing-1', npub: npubEncode(other) }]);
		expect(decision).toMatchObject({ ok: false, status: 403 });
	});

	it('rejects an expired event and an unsigned event', () => {
		const stale = signedEvent(secret, { created_at: Math.floor(Date.now() / 1000) - 16 * 60 });
		expect(authorizeDocuments(stale, [{ id: 'listing-1', npub }])).toMatchObject({
			ok: false,
			status: 401
		});

		const event = signedEvent(secret);
		const tampered = { ...event, content: 'changed' };
		expect(authorizeDocuments(tampered, [{ id: 'listing-1', npub }])).toMatchObject({
			ok: false,
			status: 401
		});
		expect(authorizeDocuments(undefined, [{ id: 'listing-1', npub }])).toMatchObject({
			ok: false,
			status: 401
		});
	});

	it('rejects a deletion event on POST and a non-deletion event on DELETE', () => {
		const deletion = signedEvent(secret, { kind: 5, tags: [['d', 'listing-1']] });
		expect(authorizeDocuments(deletion, [{ id: 'listing-1', npub }])).toMatchObject({
			ok: false,
			status: 403
		});
		const create = signedEvent(secret);
		expect(authorizeDeletion(create, ['listing-1'])).toMatchObject({ ok: false, status: 403 });
		expect(authorizeDeletion(deletion, ['listing-1']).ok).toBe(true);
	});

	it('rate limits a pubkey after 20 writes in the same minute', () => {
		const request = new Request('https://bittasker.com/api/search/documents', {
			headers: { 'cf-connecting-ip': '203.0.113.10' }
		});
		for (let i = 0; i < 20; i += 1) {
			expect(rateLimitWrite(request, pubkey, 1_000)).toBe(true);
		}
		expect(rateLimitWrite(request, pubkey, 1_000)).toBe(false);
	});

	it('refuses to index without a signed event', async () => {
		const response = await handleSearchRoute(
			new Request('https://bittasker.com/api/search/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.11' },
				body: JSON.stringify({
					index: 'tasks',
					documents: [{ id: 'listing-1', npub, title: 'Spam' }]
				})
			}),
			{ MEILI_HOST: 'https://meili.test', MEILI_MASTER_KEY: 'master' }
		);
		expect(response.status).toBe(401);
	});

	it('indexes a signed listing and blocks a later overwrite by someone else', async () => {
		const calls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, options?: RequestInit) => {
				calls.push(`${options?.method || 'GET'} ${url}`);
				if (
					String(url).includes('/documents/listing-1') &&
					(!options?.method || options.method === 'GET')
				) {
					return new Response('{}', { status: 404 });
				}
				return new Response(JSON.stringify({ taskUid: 1 }), { status: 202 });
			})
		);

		const event = signedEvent(secret);
		const env = { MEILI_HOST: 'https://meili.test', MEILI_MASTER_KEY: 'master' };
		const created = await handleSearchRoute(
			new Request('https://bittasker.com/api/search/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.12' },
				body: JSON.stringify({
					index: 'tasks',
					event,
					documents: [{ id: 'listing-1', npub, title: 'Translate a menu' }]
				})
			}),
			env
		);
		expect(created.status).toBe(200);
		const indexCall = calls.find(
			(call) => call.includes('/indexes/tasks/documents') && call.startsWith('POST')
		);
		expect(indexCall).toBeTruthy();

		resetSearchState();
		const attacker = generateSecretKey();
		const attackEvent = signedEvent(attacker, { tags: [['d', 'listing-1']] });
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, options?: RequestInit) => {
				if (
					String(url).includes('/documents/listing-1') &&
					(!options?.method || options.method === 'GET')
				) {
					return new Response(JSON.stringify({ id: 'listing-1', npub: pubkey }), { status: 200 });
				}
				return new Response(JSON.stringify({ taskUid: 1 }), { status: 202 });
			})
		);
		const overwritten = await handleSearchRoute(
			new Request('https://bittasker.com/api/search/documents', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.13' },
				body: JSON.stringify({
					index: 'tasks',
					event: attackEvent,
					documents: [
						{ id: 'listing-1', npub: npubEncode(getPublicKey(attacker)), title: 'Hijacked' }
					]
				})
			}),
			env
		);
		expect(overwritten.status).toBe(403);
	});

	it('refuses to delete a listing signed by someone else', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				if (String(url).includes('/documents/listing-1')) {
					return new Response(JSON.stringify({ id: 'listing-1', npub: pubkey }), { status: 200 });
				}
				return new Response(JSON.stringify({ taskUid: 1 }), { status: 202 });
			})
		);
		const attacker = generateSecretKey();
		const event = signedEvent(attacker, { kind: 5, tags: [['d', 'listing-1']] });
		const response = await handleSearchRoute(
			new Request('https://bittasker.com/api/search/documents', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.14' },
				body: JSON.stringify({ index: 'tasks', ids: ['listing-1'], event })
			}),
			{ MEILI_HOST: 'https://meili.test', MEILI_MASTER_KEY: 'master' }
		);
		expect(response.status).toBe(403);
	});
});

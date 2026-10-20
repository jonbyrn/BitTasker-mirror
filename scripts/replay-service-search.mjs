/**
 * One-off, idempotent replay of service events into relay2's search index.
 *
 * Preferred path: republish the original signed kind 30402 and 30403 events to
 * wss://relay2.bittasker.com. No key is required. nostr-relay-nestjs only
 * writes Meilisearch after a database insert or replace, so an event it
 * already stored is acknowledged as a duplicate and is not indexed.
 *
 * Fallback, used when --upsert is passed and MEILI_SEARCH_API_KEY is set:
 * add the same document shape EventSearchRepository.toEventDocument writes
 * into the `events` index. addDocuments replaces by event id, so a second run
 * does not create duplicates. This key is the relay admin key. Do not put it
 * in VITE_* or in the Worker search key.
 *
 *   node scripts/replay-service-search.mjs
 *   MEILI_SEARCH_API_KEY=... node scripts/replay-service-search.mjs --upsert
 */

const SOURCES = ['wss://relay2.bittasker.com', 'wss://relay1.bittasker.com'];
const TARGET = 'wss://relay2.bittasker.com';
const KINDS = [30402, 30403];
const PAGE_LIMIT = 500;
const MEILI_HOST = (
	process.env.MEILI_SEARCH_HOST || 'https://ms-dc33b13a1710-25507.nyc.meilisearch.io'
).replace(/\/$/, '');

function dTagValue(event) {
	const tag = (event.tags || []).find((item) => item[0] === 'd');
	return tag && typeof tag[1] === 'string' ? tag[1] : null;
}

function expiredAt(event) {
	const tag = (event.tags || []).find((item) => item[0] === 'expiration');
	if (!tag || tag[1] == null) return null;
	const value = Number(tag[1]);
	return Number.isFinite(value) ? value : null;
}

function genericTags(event) {
	const tags = [];
	for (const tag of event.tags || []) {
		if (!Array.isArray(tag) || tag.length < 2) continue;
		if (!/^[a-zA-Z]$/.test(tag[0])) continue;
		tags.push(`${tag[0]}:${tag[1]}`);
	}
	return tags;
}

function toEventDocument(event) {
	return {
		id: event.id,
		pubkey: event.pubkey,
		author: event.pubkey,
		createdAt: event.created_at,
		kind: event.kind,
		tags: event.tags,
		genericTags: genericTags(event),
		content: event.content,
		sig: event.sig,
		expiredAt: expiredAt(event),
		dTagValue: dTagValue(event)
	};
}

function titleOf(event) {
	try {
		const content = JSON.parse(event.content || '{}');
		return typeof content.title === 'string' ? content.title : '';
	} catch {
		return '';
	}
}

function connect(url) {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(url);
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error(`timeout connecting ${url}`));
		}, 15000);
		ws.addEventListener('open', () => {
			clearTimeout(timer);
			resolve(ws);
		});
		ws.addEventListener('error', () => {
			clearTimeout(timer);
			reject(new Error(`failed to connect ${url}`));
		});
	});
}

function requestPage(ws, filter) {
	const sub = `replay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return new Promise((resolve, reject) => {
		const events = [];
		const timer = setTimeout(() => {
			ws.removeEventListener('message', onMessage);
			reject(new Error('relay page timed out'));
		}, 20000);
		function onMessage(message) {
			let frame;
			try {
				frame = JSON.parse(message.data);
			} catch {
				return;
			}
			if (!Array.isArray(frame) || frame[1] !== sub) return;
			if (frame[0] === 'EVENT' && frame[2]) events.push(frame[2]);
			if (frame[0] === 'EOSE') {
				clearTimeout(timer);
				ws.removeEventListener('message', onMessage);
				ws.send(JSON.stringify(['CLOSE', sub]));
				resolve(events);
			}
			if (frame[0] === 'NOTICE') {
				clearTimeout(timer);
				ws.removeEventListener('message', onMessage);
				reject(new Error(String(frame[1] || 'notice')));
			}
		}
		ws.addEventListener('message', onMessage);
		ws.send(JSON.stringify(['REQ', sub, filter]));
	});
}

async function fetchKind(url, kind) {
	const ws = await connect(url);
	const found = new Map();
	let until;
	try {
		for (let page = 0; page < 40; page += 1) {
			const filter = { kinds: [kind], limit: PAGE_LIMIT };
			if (until) filter.until = until;
			const batch = await requestPage(ws, filter);
			if (batch.length === 0) break;
			let oldest = Infinity;
			let added = 0;
			for (const event of batch) {
				if (!found.has(event.id)) {
					found.set(event.id, event);
					added += 1;
				}
				if (typeof event.created_at === 'number' && event.created_at < oldest) {
					oldest = event.created_at;
				}
			}
			if (!Number.isFinite(oldest) || added === 0) break;
			until = oldest - 1;
			if (batch.length < PAGE_LIMIT) break;
		}
	} finally {
		ws.close();
	}
	return found;
}

function publishOne(ws, event) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			ws.removeEventListener('message', onMessage);
			reject(new Error(`publish timeout ${event.id}`));
		}, 15000);
		function onMessage(message) {
			let frame;
			try {
				frame = JSON.parse(message.data);
			} catch {
				return;
			}
			if (!Array.isArray(frame) || frame[0] !== 'OK' || frame[1] !== event.id) return;
			clearTimeout(timer);
			ws.removeEventListener('message', onMessage);
			resolve({ ok: frame[2] === true, message: String(frame[3] || '') });
		}
		ws.addEventListener('message', onMessage);
		ws.send(JSON.stringify(['EVENT', event]));
	});
}

async function relaySearchCount(kind, query) {
	const params = new URLSearchParams();
	params.append('kinds[]', String(kind));
	params.set('limit', '100');
	if (query) params.set('search', query);
	const response = await fetch(`https://relay2.bittasker.com/api/v1/events?${params}`, {
		headers: { Accept: 'application/json', 'User-Agent': 'bittasker-replay' }
	});
	const body = await response.json();
	const events = Array.isArray(body.data) ? body.data : [];
	return { status: response.status, count: events.length, titles: events.slice(0, 3).map(titleOf) };
}

async function upsertDocuments(events) {
	const key = process.env.MEILI_SEARCH_API_KEY;
	if (!key) throw new Error('MEILI_SEARCH_API_KEY is not set');
	const documents = events.map(toEventDocument);
	let indexed = 0;
	for (let offset = 0; offset < documents.length; offset += 100) {
		const slice = documents.slice(offset, offset + 100);
		const response = await fetch(`${MEILI_HOST}/indexes/events/documents`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(slice)
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(`Meili upsert failed ${response.status} ${JSON.stringify(body)}`);
		}
		indexed += slice.length;
	}
	return indexed;
}

async function main() {
	const upsert = process.argv.includes('--upsert');
	const byId = new Map();
	for (const url of SOURCES) {
		for (const kind of KINDS) {
			const page = await fetchKind(url, kind);
			console.log(`${url} kind ${kind}: ${page.size}`);
			for (const [id, event] of page) byId.set(id, event);
		}
	}
	const events = [...byId.values()].filter((event) => KINDS.includes(event.kind));
	const sample = events.find((event) => titleOf(event).trim().length > 3);
	const sampleTitle = sample ? titleOf(sample) : '';
	const sampleWord = (sampleTitle.match(/[A-Za-z]{5,}/) || [''])[0].toLowerCase();
	console.log(`unique events: ${events.length}`);
	console.log(`sample: ${sampleTitle} word=${sampleWord}`);

	const before = {};
	for (const kind of KINDS) {
		before[kind] = await relaySearchCount(kind, sampleWord);
	}
	console.log('before', JSON.stringify(before));

	const target = await connect(TARGET);
	const results = { accepted: 0, duplicate: 0, rejected: 0 };
	const messages = new Map();
	try {
		for (const event of events) {
			const result = await publishOne(target, event);
			if (result.ok) results.accepted += 1;
			else if (/duplicate|already/i.test(result.message)) results.duplicate += 1;
			else results.rejected += 1;
			messages.set(result.message || (result.ok ? 'ok' : 'rejected'), (messages.get(result.message) || 0) + 1);
		}
	} finally {
		target.close();
	}
	console.log('republish', results);
	console.log('relay messages', Object.fromEntries(messages));

	let upserted = 0;
	if (upsert) {
		upserted = await upsertDocuments(events);
		console.log('upserted', upserted);
	}

	await new Promise((resolve) => setTimeout(resolve, 2000));
	const after = {};
	for (const kind of KINDS) {
		after[kind] = await relaySearchCount(kind, sampleWord);
	}
	console.log('after', JSON.stringify(after));
	console.log(
		JSON.stringify({
			unique: events.length,
			republish: results,
			upserted,
			sampleWord,
			sampleTitle,
			before,
			after
		})
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});

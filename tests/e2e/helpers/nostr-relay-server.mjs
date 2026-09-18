import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.E2E_TASK_RELAY_PORT || 7777);
const events = new Map();
const subscribers = new Set();

function matchesFilter(event, filter) {
	if (filter.ids?.length && !filter.ids.includes(event.id)) return false;
	if (
		filter.authors?.length &&
		!filter.authors.some((author) => author.toLowerCase() === event.pubkey.toLowerCase())
	) {
		return false;
	}
	if (filter.kinds?.length && !filter.kinds.includes(event.kind)) return false;
	if (typeof filter.since === 'number' && event.created_at < filter.since) return false;
	if (typeof filter.until === 'number' && event.created_at > filter.until) return false;

	for (const [key, values] of Object.entries(filter)) {
		if (!key.startsWith('#') || !Array.isArray(values) || values.length === 0) continue;
		const tagName = key.slice(1);
		const eventValues = event.tags.filter((tag) => tag[0] === tagName).map((tag) => tag[1]);
		if (!values.some((value) => eventValues.includes(value))) return false;
	}
	return true;
}

function queryEvents(filter) {
	const matched = [...events.values()].filter((event) => matchesFilter(event, filter));
	matched.sort((a, b) => b.created_at - a.created_at);
	return typeof filter.limit === 'number' ? matched.slice(0, filter.limit) : matched;
}

function broadcast(event) {
	for (const subscriber of subscribers) {
		for (const [subId, filters] of subscriber.subs) {
			if (filters.some((filter) => matchesFilter(event, filter))) {
				subscriber.send(['EVENT', subId, event]);
			}
		}
	}
}

function send(socket, payload) {
	if (socket.readyState === socket.OPEN) {
		socket.send(JSON.stringify(payload));
	}
}

const httpServer = createServer((req, res) => {
	if (req.url === '/health') {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify({ ok: true, events: events.size }));
		return;
	}
	res.writeHead(404);
	res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket) => {
	const client = {
		subs: new Map(),
		send: (payload) => send(socket, payload)
	};
	subscribers.add(client);

	socket.on('message', (raw) => {
		let message;
		try {
			message = JSON.parse(String(raw));
		} catch {
			send(socket, ['NOTICE', 'invalid json']);
			return;
		}
		if (!Array.isArray(message) || typeof message[0] !== 'string') {
			send(socket, ['NOTICE', 'invalid message']);
			return;
		}

		const [type, ...rest] = message;
		if (type === 'EVENT') {
			const event = rest[0];
			if (!event?.id || !event.pubkey || !Array.isArray(event.tags)) {
				send(socket, ['OK', event?.id ?? '', false, 'invalid: event']);
				return;
			}
			events.set(event.id, event);
			send(socket, ['OK', event.id, true, '']);
			broadcast(event);
			return;
		}
		if (type === 'REQ') {
			const [subId, ...filters] = rest;
			if (typeof subId !== 'string') return;
			const normalizedFilters = filters.filter((filter) => filter && typeof filter === 'object');
			client.subs.set(subId, normalizedFilters);
			const seen = new Set();
			for (const filter of normalizedFilters) {
				for (const event of queryEvents(filter)) {
					if (seen.has(event.id)) continue;
					seen.add(event.id);
					send(socket, ['EVENT', subId, event]);
				}
			}
			send(socket, ['EOSE', subId]);
			return;
		}
		if (type === 'CLOSE') {
			client.subs.delete(rest[0]);
			return;
		}
	});

	socket.on('close', () => {
		subscribers.delete(client);
	});
});

httpServer.listen(PORT, '127.0.0.1', () => {
	console.log(`[e2e-relay] listening on ws://127.0.0.1:${PORT}`);
});

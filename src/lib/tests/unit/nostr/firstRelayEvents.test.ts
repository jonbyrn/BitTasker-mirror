import { describe, expect, it, vi } from 'vitest';
import {
	eventsQueryString,
	fastRelayQueriesEnabled,
	firstRelayEvents,
	relayToHttpBase
} from '$lib/nostr/firstRelayEvents';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: async () => body
	} as Response;
}

describe('first relay events', () => {
	it('stays off under vitest so unit tests do not open relays', () => {
		expect(fastRelayQueriesEnabled()).toBe(false);
	});

	it('maps relay urls and array filters onto the HTTP events API', () => {
		expect(relayToHttpBase('wss://relay.example/')).toBe('https://relay.example');
		expect(relayToHttpBase('ws://relay.example')).toBe('http://relay.example');
		expect(relayToHttpBase('')).toBeNull();
		expect(decodeURIComponent(eventsQueryString({ kinds: [31000], limit: 10 }))).toBe(
			'kinds[]=31000&limit=10'
		);
	});

	it('returns the first non-empty page and ignores a slow, empty, or failed relay', async () => {
		const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes('slow.example')) {
				await new Promise<void>((resolve, reject) => {
					const timer = setTimeout(resolve, 800);
					init?.signal?.addEventListener('abort', () => {
						clearTimeout(timer);
						reject(new DOMException('aborted', 'AbortError'));
					});
				});
				return jsonResponse([{ id: 'slow' }]);
			}
			if (url.includes('empty.example')) return jsonResponse({ data: [] });
			if (url.includes('missing.example')) return jsonResponse({}, false, 404);
			return jsonResponse({ data: [{ id: 'fast' }] });
		});

		const events = await firstRelayEvents(
			['wss://slow.example', 'wss://empty.example', 'wss://missing.example', 'wss://fast.example'],
			{ kinds: [31000], limit: 10 },
			fetchImpl as typeof fetch
		);

		expect(events).toEqual([{ id: 'fast' }]);
		expect(fetchImpl).toHaveBeenCalled();
	});

	it('returns null when every relay is empty or down', async () => {
		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('down.example')) return jsonResponse({}, false, 500);
			return jsonResponse({ data: [] });
		});

		await expect(
			firstRelayEvents(
				['wss://down.example', 'https://empty.example'],
				{ kinds: [31000] },
				fetchImpl as typeof fetch
			)
		).resolves.toBeNull();
	});
});

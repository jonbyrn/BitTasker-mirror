import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleQvacRoute } from '../../../../../workers-site/handlers/qvac.js';

const SECRET = 'limpiar la cocina del fondo, no lo registres';

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('qvac worker proxy', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('stays hidden when the sandbox flag is off and does not call a model', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const response = await handleQvacRoute(
			new Request('http://localhost/api/qvac/draft', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: SECRET })
			}),
			{ QVAC_URL: 'http://127.0.0.1:11434' }
		);
		expect(response.status).toBe(404);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('says the local server is not connected when no origin is configured', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const response = await handleQvacRoute(
			new Request('http://localhost/api/qvac/draft', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: SECRET })
			}),
			{ QVAC_ENABLED: 'true' }
		);
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'unavailable' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('refuses a third-party model API', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const response = await handleQvacRoute(
			new Request('http://localhost/api/qvac/translate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: SECRET, to: 'en' })
			}),
			{ QVAC_ENABLED: 'true', QVAC_URL: 'https://api.openai.com' }
		);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'refused' });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('drafts through the local chat route and does not log the note', async () => {
		const logs: string[] = [];
		vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
			logs.push(args.map(String).join(' '));
		});
		const fetchMock = vi.fn(async () =>
			jsonResponse({
				choices: [
					{
						message: {
							content:
								'{"title":"Limpiar la cocina","description":"Limpieza profunda de la cocina.","categoryId":"cleaning","priceLow":15,"priceHigh":40}'
						}
					}
				]
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const response = await handleQvacRoute(
			new Request('http://localhost/api/qvac/draft', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: SECRET })
			}),
			{ QVAC_ENABLED: 'true', QVAC_URL: 'http://127.0.0.1:11434' }
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.title).toBe('Limpiar la cocina');
		expect(body.categoryId).toBe('cleaning');
		expect(body.priceLow).toBe(15);
		expect(body.priceHigh).toBe(40);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://127.0.0.1:11434/v1/chat/completions');
		const forwarded = JSON.parse(String(init.body));
		expect(forwarded.model).toBe('llama');
		expect(forwarded.messages.at(-1).content).toBe(SECRET);
		expect(logs.join('\n')).not.toContain(SECRET);
		expect(logs.join('\n')).not.toContain('Limpiar la cocina');
	});

	it('translates with the Spanish-to-English Bergamot alias', async () => {
		const fetchMock = vi.fn(async () =>
			jsonResponse({ translations: ['Clean the kitchen.'], stats: { totalTime: 41 } })
		);
		vi.stubGlobal('fetch', fetchMock);
		const response = await handleQvacRoute(
			new Request('http://localhost/api/qvac/translate', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: 'Limpiar la cocina.', to: 'en' })
			}),
			{ QVAC_ENABLED: 'true', QVAC_URL: 'http://127.0.0.1:11434/' }
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ text: 'Clean the kitchen.', to: 'en' });
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://127.0.0.1:11434/qvac/v1/translate');
		expect(JSON.parse(String(init.body)).model).toBe('bergamot-es-en');
	});

	it('forwards audio to Whisper and returns only the transcript', async () => {
		const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
			const form = init.body as FormData;
			expect(form.get('model')).toBe('whisper');
			expect(form.get('prompt')).toBeNull();
			const uploaded = form.get('file') as Blob | null;
			expect(uploaded?.size).toBeGreaterThan(0);
			return jsonResponse({ text: 'Necesito limpiar la cocina', extra: 'drop me' });
		});
		vi.stubGlobal('fetch', fetchMock);
		const form = new FormData();
		form.set('file', new File(['audio'], 'speech.webm', { type: 'audio/webm' }));
		form.set('prompt', SECRET);
		const response = await handleQvacRoute(
			new Request('http://localhost/api/qvac/transcribe', { method: 'POST', body: form }),
			{ QVAC_ENABLED: 'true', QVAC_URL: 'http://127.0.0.1:11434' }
		);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ text: 'Necesito limpiar la cocina' });
		const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://127.0.0.1:11434/v1/audio/transcriptions');
	});

	it('rejects an oversized recording before calling the model', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const form = new FormData();
		form.set(
			'file',
			new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'speech.webm', { type: 'audio/webm' })
		);
		const response = await handleQvacRoute(
			new Request('http://localhost/api/qvac/transcribe', { method: 'POST', body: form }),
			{ QVAC_ENABLED: 'true', QVAC_URL: 'http://127.0.0.1:11434' }
		);
		expect(response.status).toBe(413);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

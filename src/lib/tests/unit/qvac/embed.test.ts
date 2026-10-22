import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	cosine,
	embedDimensions,
	embedTexts,
	embeddingSource,
	needsEmbedding,
	vectorQuery
} from '$lib/qvac/embed.js';
import { embedBackfillBlocker } from '../../../../../scripts/search-embed-backfill.mjs';

const exec = promisify(execFile);

describe('qvac embeddings', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('builds a hybrid query from a 768-wide vector by default', () => {
		expect(embedDimensions({})).toBe(768);
		expect(embedDimensions({ QVAC_EMBED_DIM: '4' })).toBe(4);
		expect(embedDimensions({ QVAC_EMBED_DIM: 'nope' })).toBe(768);
		expect(vectorQuery([0.1234567, -1], 20)).toBe('embedding:([0.123457,-1], k:20, alpha:0.6)');
		const roof = [1, 0, 0];
		const techos = [0.9, 0.1, 0];
		const unrelated = [0, 1, 0];
		expect(cosine(roof, techos)).toBeGreaterThan(cosine(roof, unrelated));
	});

	it('embeds English and Spanish fields together and skips a stored vector', () => {
		expect(
			embeddingSource({
				title: 'Fix my leaking roof',
				description_es: 'techos y goteras'
			})
		).toBe('Fix my leaking roof\ntechos y goteras');
		expect(needsEmbedding({ title: 'Roof' }, 2)).toBe(true);
		expect(needsEmbedding({ embedding: [0.1, 0.2] }, 2)).toBe(false);
		expect(needsEmbedding({ embedding: [0.1] }, 2)).toBe(true);
	});

	it('sends the bearer token and does not log the text', async () => {
		const logs: string[] = [];
		vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
			logs.push(args.map(String).join(' '));
		});
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] }), { status: 200 })
		);
		const vectors = await embedTexts(
			{
				QVAC_ENABLED: 'true',
				QVAC_BASE_URL: 'http://127.0.0.1:11434',
				QVAC_BEARER_TOKEN: 'embed-secret',
				QVAC_EMBED_DIM: '2'
			},
			['techos y goteras'],
			fetchMock as typeof fetch
		);
		expect(vectors).toEqual([[0.1, 0.2]]);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://127.0.0.1:11434/v1/embeddings');
		expect((init.headers as Record<string, string>).authorization).toBe('Bearer embed-secret');
		expect(JSON.parse(String(init.body)).input).toEqual(['techos y goteras']);
		expect(logs.join('\n')).not.toContain('techos');
		expect(logs.join('\n')).not.toContain('embed-secret');
	});

	it('uses the OpenAI route first and fails fast when every route is missing', async () => {
		const fetchMock = vi.fn(async (url: string) => {
			if (String(url).endsWith('/v1/embeddings')) {
				return new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.1, 0.2] }] }), {
					status: 200
				});
			}
			return new Response('missing', { status: 404 });
		});
		const vectors = await embedTexts(
			{
				QVAC_ENABLED: 'true',
				QVAC_BASE_URL: 'http://127.0.0.1:11434',
				QVAC_EMBED_DIM: '2'
			},
			['roof'],
			fetchMock as typeof fetch
		);
		expect(vectors).toEqual([[0.1, 0.2]]);
		expect(fetchMock).toHaveBeenCalledTimes(1);

		const fallback = vi.fn(async (url: string) => {
			if (String(url).endsWith('/api/embed')) {
				return new Response(JSON.stringify({ embeddings: [[0.1, 0.2]] }), { status: 200 });
			}
			return new Response('missing', { status: 404 });
		});
		const fromFallback = await embedTexts(
			{
				QVAC_ENABLED: 'true',
				QVAC_BASE_URL: 'http://127.0.0.1:11434',
				QVAC_EMBED_DIM: '2'
			},
			['roof'],
			fallback as typeof fetch
		);
		expect(fromFallback).toEqual([[0.1, 0.2]]);
		expect(String(fallback.mock.calls[0][0])).toMatch(/\/v1\/embeddings$/);

		const missing = vi.fn(async () => new Response('missing', { status: 404 }));
		await expect(
			embedTexts(
				{
					QVAC_ENABLED: 'true',
					QVAC_BASE_URL: 'http://127.0.0.1:11434',
					QVAC_EMBED_STRICT: 'true'
				},
				['roof'],
				missing as typeof fetch
			)
		).rejects.toThrow(/EMBEDDINGGEMMA_300M_Q4_0/);
	});

	it('returns null when QVAC fails and drops a vector of the wrong length', async () => {
		const down = await embedTexts(
			{ QVAC_ENABLED: 'true', QVAC_BASE_URL: 'http://127.0.0.1:11434' },
			['roof'],
			(async () => new Response('no', { status: 500 })) as typeof fetch
		);
		expect(down).toBeNull();
		const wrong = await embedTexts(
			{
				QVAC_ENABLED: 'true',
				QVAC_BASE_URL: 'http://127.0.0.1:11434',
				QVAC_EMBED_DIM: '2'
			},
			['roof'],
			(async () =>
				new Response(JSON.stringify({ embeddings: [[1, 2, 3]] }), {
					status: 200
				})) as typeof fetch
		);
		expect(wrong).toEqual([null]);
		expect(await embedTexts({ QVAC_ENABLED: 'false' }, ['roof'])).toBeNull();
	});

	it('refuses to backfill when the embed env is missing and does not print a secret', async () => {
		expect(embedBackfillBlocker({})).toMatch(/Nothing was deleted/);
		const secret = 'nsec1should-not-print';
		await expect(
			exec('node', ['scripts/search-embed-backfill.mjs'], {
				env: { PATH: process.env.PATH, ASSISTANT_NSEC: secret }
			})
		).rejects.toMatchObject({ code: 1 });
		try {
			await exec('node', ['scripts/search-embed-backfill.mjs'], {
				env: { PATH: process.env.PATH, ASSISTANT_NSEC: secret }
			});
		} catch (error) {
			const text = `${(error as { stdout?: string }).stdout || ''}\n${(error as { stderr?: string }).stderr || ''}`;
			expect(text).toMatch(/Nothing was deleted/);
			expect(text).not.toContain(secret);
		}
	});
});

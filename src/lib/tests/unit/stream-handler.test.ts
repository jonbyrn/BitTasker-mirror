/**
 * Unit tests for the Cloudflare Stream Worker handler.
 *
 * Tests the handleStreamRoute function exported from workers-site/handlers/stream.js
 * using mocked env bindings (STREAM, VIDEO_STATUS KV) and standard Request objects.
 *
 * Run: npx vitest run src/lib/tests/unit/stream-handler.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStreamRoute } from '../../../../workers-site/handlers/stream.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost';
const UPLOAD_PATH = '/api/cloudflare/stream/upload-url';
const TOKEN_PATH = '/api/cloudflare/stream/token/';
const STATUS_PATH = '/api/cloudflare/stream/status/';
const WEBHOOK_PATH = '/api/cloudflare/stream/webhook';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock env object matching the bindings the handler expects.
 *
 * STREAM       – Cloudflare Stream binding (createDirectUpload, video)
 * VIDEO_STATUS – optional KV namespace (get, put)
 * CLOUDFLARE_STREAM_WEBHOOK_SECRET – shared secret for webhook HMAC
 */
function createMockEnv(overrides = {}) {
	return {
		STREAM: {
			createDirectUpload: vi.fn(),
			video: vi.fn(() => ({ generateToken: vi.fn() }))
		},
		CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
		CLOUDFLARE_API_TOKEN: 'test-api-token',
		CLOUDFLARE_STREAM_WEBHOOK_SECRET: 'test-webhook-secret',
		VIDEO_STATUS: { get: vi.fn(), put: vi.fn() },
		...overrides
	};
}

function createRequest(url: string, options: RequestInit = {}) {
	return new Request(url, options);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleStreamRoute', () => {
	let env: ReturnType<typeof createMockEnv>;

	beforeEach(() => {
		vi.clearAllMocks();
		env = createMockEnv();
	});

	// ── POST /api/cloudflare/stream/upload-url ──────────────────────────

	describe('POST /api/cloudflare/stream/upload-url', () => {
		it('returns { uploadURL, uid } on success', async () => {
			const uploadURL = 'https://upload.videodelivery.net/abc123';
			const id = 'video-uid-12345';
			// Cloudflare Stream API returns { uploadURL, id }
			env.STREAM.createDirectUpload.mockResolvedValue({ uploadURL, id });

			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${UPLOAD_PATH}`, {
					method: 'POST',
					body: JSON.stringify({ maxDurationSeconds: 300 }),
					headers: { 'Content-Type': 'application/json' }
				}),
				env
			);

			expect(res.status).toBe(200);
			const data = await res.json();
			// Handler re-maps result.id -> uid in the response
			expect(data).toEqual({ uploadURL, uid: id });
			expect(env.STREAM.createDirectUpload).toHaveBeenCalledWith({ maxDurationSeconds: 300 });
		});

		it('returns error when createDirectUpload fails', async () => {
			env.STREAM.createDirectUpload.mockRejectedValue(new Error('API limit reached'));

			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${UPLOAD_PATH}`, {
					method: 'POST',
					body: '{}',
					headers: { 'Content-Type': 'application/json' }
				}),
				env
			);

			expect(res.status).toBe(500);
			const data = await res.json();
			expect(data).toEqual({
				error: { code: 'UPLOAD_URL_FAILED', message: 'API limit reached' }
			});
		});

		it('caps maxDurationSeconds at 600', async () => {
			env.STREAM.createDirectUpload.mockResolvedValue({
				uploadURL: 'https://upload.videodelivery.net/abc',
				uid: 'uid-1'
			});

			await handleStreamRoute(
				createRequest(`${BASE_URL}${UPLOAD_PATH}`, {
					method: 'POST',
					body: JSON.stringify({ maxDurationSeconds: 9999 }),
					headers: { 'Content-Type': 'application/json' }
				}),
				env
			);

			expect(env.STREAM.createDirectUpload).toHaveBeenCalledWith({ maxDurationSeconds: 600 });
		});
	});

	// ── GET /api/cloudflare/stream/token/:uid ───────────────────────────

	describe('GET /api/cloudflare/stream/token/:uid', () => {
		it('returns { token, expiresAt } on success', async () => {
			const token = 'signed-jwt-token';
			const generateToken = vi.fn().mockResolvedValue(token);
			env.STREAM.video = vi.fn(() => ({ generateToken }));

			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${TOKEN_PATH}video-uid-12345`, {
					headers: { Authorization: 'Bearer test-auth' }
				}),
				env
			);

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.token).toBe(token);
			expect(typeof data.expiresAt).toBe('number');
			// expiresAt is Date.now() + 3600_000 — should be in the near future
			expect(data.expiresAt).toBeGreaterThan(Date.now() - 1000);
			expect(env.STREAM.video).toHaveBeenCalledWith('video-uid-12345');
			expect(generateToken).toHaveBeenCalled();
		});

		it('returns 401 when no auth header/cookie', async () => {
			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${TOKEN_PATH}video-uid-12345`),
				env
			);

			expect(res.status).toBe(401);
			const data = await res.json();
			expect(data).toEqual({
				error: { code: 'AUTH_REQUIRED', message: 'Authentication required for token access' }
			});
		});

		it('returns 400 for short UID', async () => {
			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${TOKEN_PATH}ab`, {
					headers: { Authorization: 'Bearer test' }
				}),
				env
			);

			expect(res.status).toBe(400);
			const data = await res.json();
			expect(data).toEqual({
				error: { code: 'INVALID_UID', message: 'Invalid video UID' }
			});
		});
	});

	// ── GET /api/cloudflare/stream/status/:uid ──────────────────────────

	describe('GET /api/cloudflare/stream/status/:uid', () => {
		it('returns { uid, state } from KV cache when available', async () => {
			const cached = { uid: 'video-uid-12345', state: 'ready' };
			env.VIDEO_STATUS.get.mockResolvedValue(cached);

			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${STATUS_PATH}video-uid-12345`),
				env
			);

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toEqual(cached);
			expect(env.VIDEO_STATUS.get).toHaveBeenCalledWith('video-uid-12345', 'json');
		});
		it('returns Cloudflare status when no cached entry exists', async () => {
			env.VIDEO_STATUS.get.mockResolvedValue(null);
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(
					new Response(
						JSON.stringify({
							result: {
								status: { state: 'inprogress', pctComplete: '75.5' },
								duration: 120,
								size: 5_000_000,
								created: '2026-01-01T00:00:00Z',
								readyToStream: false
							}
						}),
						{ status: 200 }
					)
				)
			);

			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${STATUS_PATH}video-uid-12345`),
				env
			);

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.uid).toBe('video-uid-12345');
			expect(data.state).toBe('inprogress');
			expect(data.pctComplete).toBe(75.5);
		});

		it('returns Cloudflare status when VIDEO_STATUS KV is not bound', async () => {
			env.VIDEO_STATUS = undefined as unknown as (typeof env)['VIDEO_STATUS'];
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(
					new Response(
						JSON.stringify({
							result: {
								status: { state: 'queued' },
								duration: 0,
								size: 0,
								created: '2026-01-01T00:00:00Z',
								readyToStream: false
							}
						}),
						{ status: 200 }
					)
				)
			);

			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${STATUS_PATH}video-uid-12345`),
				env
			);

			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data.uid).toBe('video-uid-12345');
			expect(data.state).toBe('queued');
		});

		it('returns 400 for empty UID', async () => {
			const res = await handleStreamRoute(
				// Trailing slash with no UID: .pop() returns ''
				createRequest(`${BASE_URL}${STATUS_PATH}`),
				env
			);

			expect(res.status).toBe(400);
			const data = await res.json();
			expect(data).toEqual({
				error: { code: 'INVALID_UID', message: 'Invalid video UID' }
			});
		});
	});

	// ── POST /api/cloudflare/stream/webhook ─────────────────────────────

	describe('POST /api/cloudflare/stream/webhook', () => {
		it('returns 401 for invalid signature', async () => {
			const body = JSON.stringify({ status: 'ready', uid: 'test-uid-12345' });
			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${WEBHOOK_PATH}`, {
					method: 'POST',
					body,
					headers: {
						'Content-Type': 'application/json',
						// Arbitrary sig0 — the real crypto.subtle (available in Node 20+)
						// will produce a different HMAC, so the check returns false.
						'Cf-Webhook-Signature': 'time=1234567890,sig0=dGhpc2lzbm90bWF0Y2hpbmc='
					}
				}),
				env
			);

			expect(res.status).toBe(401);
			const data = await res.json();
			expect(data).toEqual({
				error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' }
			});
		});
	});

	// ── OPTIONS preflight ───────────────────────────────────────────────

	describe('OPTIONS preflight', () => {
		it('returns CORS headers for upload-url endpoint', async () => {
			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${UPLOAD_PATH}`, { method: 'OPTIONS' }),
				env
			);

			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
			expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
			expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
		});

		it('returns CORS headers for status endpoint', async () => {
			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${STATUS_PATH}video-uid-12345`, { method: 'OPTIONS' }),
				env
			);

			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
			expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
			expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
		});

		it('returns CORS headers for token endpoint', async () => {
			const res = await handleStreamRoute(
				createRequest(`${BASE_URL}${TOKEN_PATH}video-uid-12345`, { method: 'OPTIONS' }),
				env
			);

			// Without an Origin header, getAllowedOrigin falls back to the first
			// entry in ALLOWED_ORIGINS ('https://bittasker.com').
			expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://bittasker.com');
			expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
			expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
		});
	});
});

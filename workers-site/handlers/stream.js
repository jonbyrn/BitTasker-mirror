/**
 * Cloudflare Stream API endpoints
 *
 * POST /api/cloudflare/stream/upload-url - generate one-time upload URL
 * GET  /api/cloudflare/stream/token/:uid  - generate signed playback JWT
 * GET  /api/cloudflare/stream/status/:uid - poll encoding status
 */

const ALLOWED_ORIGINS = [
	'https://bittasker.com',
	'https://worker.dev.bittasker.com',
	'https://worker.prod.bittasker.com',
	'https://staging.bittasker.com'
];

function getAllowedOrigin(request) {
	const origin = request.headers.get('Origin');
	if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
	return ALLOWED_ORIGINS[0];
}

const CORS_UPLOAD = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const CORS_STATUS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

function tokenCors(request) {
	return {
		'Access-Control-Allow-Origin': getAllowedOrigin(request),
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization'
	};
}

function json(data, status, extraHeaders) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }
	});
}

function error(code, message, status, extraHeaders) {
	return new Response(JSON.stringify({ error: { code, message } }), {
		status,
		headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }
	});
}

/**
 * Verify HMAC-SHA256 signature for Cloudflare Stream webhook payloads.
 *
 * Cloudflare Stream sends Cf-Webhook-Signature: time=<ts>,sig0=<base64hmac>
 * The signed payload is "time=<ts>." concatenated with the raw request body.
 * Returns true when sig0 computed with webhookSecret matches the header value.
 */
async function verifyWebhookSignature(request, webhookSecret) {
	const signatureHeader = request.headers.get('Cf-Webhook-Signature');
	if (!signatureHeader || !webhookSecret) return false;

	const parts = {};
	for (const pair of signatureHeader.split(',')) {
		const [key, value] = pair.split('=');
		if (key && value) parts[key.trim()] = value.trim();
	}

	const time = parts['time'];
	const sig0 = parts['sig0'];
	if (!time || !sig0) return false;

	const body = await request.clone().text();
	const payload = `time=${time}.${body}`;

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(webhookSecret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
	const expected = btoa(String.fromCharCode(...new Uint8Array(signature)));

	return expected === sig0;
}

export async function handleStreamRoute(request, env) {
	const url = new URL(request.url);
	const pathname = url.pathname;
	const method = request.method;

	// OPTIONS preflight for Capacitor WebView
	if (method === 'OPTIONS') {
		if (pathname.includes('/token/')) {
			return new Response(null, { headers: tokenCors(request) });
		}
		if (pathname.includes('/status/')) {
			return new Response(null, { headers: CORS_STATUS });
		}
		return new Response(null, { headers: CORS_UPLOAD });
	}

	// POST /api/cloudflare/stream/upload-url
	if (method === 'POST' && pathname === '/api/cloudflare/stream/upload-url') {
		try {
			const body = await request.json().catch(() => ({}));
			const maxDurationSeconds = Math.min(body.maxDurationSeconds ?? 600, 600);
			const result = await env.STREAM.createDirectUpload({ maxDurationSeconds });
			return json({ uploadURL: result.uploadURL, uid: result.id }, 200, CORS_UPLOAD);
		} catch (e) {
			return error(
				'UPLOAD_URL_FAILED',
				e.message || 'Failed to create upload URL',
				500,
				CORS_UPLOAD
			);
		}
	}

	// POST /api/cloudflare/stream/webhook
	if (method === 'POST' && pathname === '/api/cloudflare/stream/webhook') {
		try {
			const valid = await verifyWebhookSignature(request, env.CLOUDFLARE_STREAM_WEBHOOK_SECRET);
			if (!valid) {
				return error('INVALID_SIGNATURE', 'Invalid webhook signature', 401);
			}

			const body = await request.json().catch(() => ({}));
			const event = body.status;
			const uid = body.uid;

			if (uid && (event === 'ready' || event === 'error') && env.VIDEO_STATUS?.put) {
				const kvData = {
					uid,
					state: event,
					...(event === 'error'
						? { errorReason: body.errorReasonCode || body.meta?.error_reason || 'unknown' }
						: {})
				};
				await env.VIDEO_STATUS.put(uid, JSON.stringify(kvData));
			}

			return json({ ok: true }, 200);
		} catch (e) {
			return error('WEBHOOK_FAILED', e.message || 'Webhook processing failed', 500);
		}
	}

	// GET /api/cloudflare/stream/token/:uid
	if (method === 'GET' && pathname.startsWith('/api/cloudflare/stream/token/')) {
		const uid = pathname.split('/').pop();
		if (!uid || uid.length < 10) {
			return error('INVALID_UID', 'Invalid video UID', 400, tokenCors(request));
		}

		// Basic auth gate — require session cookie or Authorization header
		const hasAuthHeader = request.headers.get('Authorization');
		const hasSessionCookie = (request.headers.get('Cookie') || '')
			.split(';')
			.some((c) => c.trim().startsWith('session=') || c.trim().startsWith('connect.sid='));
		if (!hasAuthHeader && !hasSessionCookie) {
			return error(
				'AUTH_REQUIRED',
				'Authentication required for token access',
				401,
				tokenCors(request)
			);
		}

		try {
			const token = await env.STREAM.video(uid).generateToken();
			return json({ token, expiresAt: Date.now() + 3600 * 1000 }, 200, tokenCors(request));
		} catch (e) {
			return error(
				'TOKEN_FAILED',
				e.message || 'Failed to generate token',
				500,
				tokenCors(request)
			);
		}
	}

	// GET /api/cloudflare/stream/status/:uid
	if (method === 'GET' && pathname.startsWith('/api/cloudflare/stream/status/')) {
		const uid = pathname.split('/').pop();
		if (!uid || uid.length < 10) {
			return error('INVALID_UID', 'Invalid video UID', 400, CORS_STATUS);
		}
		try {
			const cached = env.VIDEO_STATUS ? await env.VIDEO_STATUS.get(uid, 'json') : null;
			if (cached) {
				return json(cached, 200, CORS_STATUS);
			}
			return json({ uid, state: 'encoding' }, 200, CORS_STATUS);
		} catch (e) {
			return error('STATUS_FAILED', e.message || 'Failed to get video status', 500, CORS_STATUS);
		}
	}

	return error('NOT_FOUND', 'Stream endpoint not found', 404);
}

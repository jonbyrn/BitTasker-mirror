// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/**
 * Cloudflare Stream API endpoints
 *
 * POST /api/cloudflare/stream/upload-url - generate one-time basic POST upload URL (< 200MB)
 * POST /api/cloudflare/stream/tus        - TUS protocol proxy for resumable uploads (any size)
 * GET  /api/cloudflare/stream/token/:uid  - generate signed playback JWT
 * GET  /api/cloudflare/stream/status/:uid - poll encoding status
 *
 * @see https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 * @see https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/
 */

const ALLOWED_ORIGINS = [
	'https://bittasker.com',
	'https://dev.bittasker.com',
	'https://worker.dev.bittasker.com',
	'https://worker.prod.bittasker.com',
	'https://staging.bittasker.com',
	'http://localhost:3000'
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

// TUS protocol requires specific headers for resumable uploads
const CORS_TUS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS, HEAD, PATCH, DELETE',
	'Access-Control-Allow-Headers':
		'Content-Type, Authorization, Upload-Length, Upload-Metadata, Upload-Offset, Tus-Resumable, Tus-Version, Tus-Extension, Tus-Max-Size, X-HTTP-Method-Override, Upload-Creator',
	'Access-Control-Expose-Headers':
		'Upload-Offset, Upload-Length, Tus-Version, Tus-Resumable, Tus-Max-Size, Tus-Extension, Location, Stream-Media-Id',
	'Tus-Resumable': '1.0.0',
	'Tus-Version': '1.0.0',
	'Tus-Extension': 'creation,creation-with-upload,termination,concatenation,creation-defer-length'
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

	// OPTIONS preflight for Capacitor WebView and TUS protocol
	if (method === 'OPTIONS') {
		if (pathname.includes('/token/')) {
			return new Response(null, { headers: tokenCors(request) });
		}
		if (pathname.includes('/status/')) {
			return new Response(null, { headers: CORS_STATUS });
		}
		if (pathname === '/api/cloudflare/stream/tus') {
			return new Response(null, { status: 204, headers: CORS_TUS });
		}
		return new Response(null, { headers: CORS_UPLOAD });
	}

	// POST /api/cloudflare/stream/upload-url (basic POST for < 200MB)
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

	// POST /api/cloudflare/stream/tus — TUS protocol proxy for resumable uploads
	// This endpoint proxies TUS creation requests to Cloudflare's REST API.
	// The client sends TUS headers (Upload-Length, Upload-Metadata) and we forward them
	// to Cloudflare, returning the Location header with the actual TUS upload URL.
	//
	// @see https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/#direct-creator-uploads-with-tus-protocol
	if (method === 'POST' && pathname === '/api/cloudflare/stream/tus') {
		try {
			const uploadLength = request.headers.get('Upload-Length');
			const uploadMetadata = request.headers.get('Upload-Metadata');

			if (!uploadLength) {
				return error('MISSING_UPLOAD_LENGTH', 'Upload-Length header is required', 400, CORS_TUS);
			}

			// Validate chunk size requirements (5MB minimum for TUS)
			const fileSize = parseInt(uploadLength, 10);
			if (isNaN(fileSize) || fileSize <= 0) {
				return error(
					'INVALID_UPLOAD_LENGTH',
					'Upload-Length must be a positive integer',
					400,
					CORS_TUS
				);
			}

			// Build the TUS creation request to Cloudflare's REST API
			// Using direct_user=true for direct creator uploads
			const tusEndpoint = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`;

			const tusHeaders = {
				Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
				'Tus-Resumable': '1.0.0',
				'Upload-Length': uploadLength
			};

			// Forward Upload-Metadata if provided (contains filename, filetype, maxDurationSeconds, etc.)
			if (uploadMetadata) {
				tusHeaders['Upload-Metadata'] = uploadMetadata;
			}

			const tusResponse = await fetch(tusEndpoint, {
				method: 'POST',
				headers: tusHeaders
			});

			if (!tusResponse.ok) {
				const errorText = await tusResponse.text();
				console.error('[Stream TUS] Cloudflare API error:', tusResponse.status, errorText);
				return error(
					'TUS_CREATION_FAILED',
					`Failed to create TUS upload: ${tusResponse.status}`,
					tusResponse.status,
					CORS_TUS
				);
			}

			// Extract the Location header which contains the TUS upload URL
			const location = tusResponse.headers.get('Location');
			let streamMediaId = tusResponse.headers.get('stream-media-id');

			if (!location) {
				return error(
					'TUS_NO_LOCATION',
					'Cloudflare did not return a Location header',
					500,
					CORS_TUS
				);
			}

			// Extract video UID from Location URL if stream-media-id header is not provided
			// Location format: https://upload.cloudflarestream.com/tus/{video_uid}
			if (!streamMediaId) {
				const uidMatch = location.match(/\/tus\/([a-f0-9]{32})(?:\?|$)/);
				if (uidMatch) {
					streamMediaId = uidMatch[1];
				}
			}

			// Return 201 Created with Location header as per TUS protocol
			return new Response(null, {
				status: 201,
				headers: {
					...CORS_TUS,
					Location: location,
					'Stream-Media-Id': streamMediaId || ''
				}
			});
		} catch (e) {
			console.error('[Stream TUS] Error:', e);
			return error('TUS_ERROR', e.message || 'TUS upload creation failed', 500, CORS_TUS);
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
	// Returns granular video status for progress tracking:
	// - notfound: Video doesn't exist yet (upload may still be in transit)
	// - pendingupload: Cloudflare received metadata, waiting for bytes
	// - downloading: Cloudflare is receiving/processing bytes
	// - queued: Bytes received, waiting for encoder
	// - inprogress: Encoding in progress (pctComplete available)
	// - ready: Video ready to stream
	// - error: Processing failed
	if (method === 'GET' && pathname.startsWith('/api/cloudflare/stream/status/')) {
		const uid = pathname.split('/').pop();
		if (!uid || uid.length < 10) {
			return error('INVALID_UID', 'Invalid video UID', 400, CORS_STATUS);
		}
		try {
			// Check KV cache first for terminal states
			const cached = env.VIDEO_STATUS ? await env.VIDEO_STATUS.get(uid, 'json') : null;
			if (cached && (cached.state === 'ready' || cached.state === 'error')) {
				return json(cached, 200, CORS_STATUS);
			}

			// Query Cloudflare Stream API for actual status
			const cfResponse = await fetch(
				`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
				{
					headers: {
						Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
						'Content-Type': 'application/json'
					}
				}
			);

			if (!cfResponse.ok) {
				// 404 = video doesn't exist yet (upload still in transit or failed)
				if (cfResponse.status === 404) {
					return json({ uid, state: 'notfound' }, 200, CORS_STATUS);
				}
				const cfError = await cfResponse.text();
				console.error('Cloudflare status API error:', cfError);
				return json({ uid, state: 'notfound' }, 200, CORS_STATUS);
			}

			const cfData = await cfResponse.json();
			const video = cfData.result;

			// Return actual Cloudflare state for granular progress tracking
			// Cloudflare states: pendingupload, downloading, queued, inprogress, ready, error
			const cfState = video.status?.state || 'unknown';
			let state = cfState;
			let errorReason = null;

			// Override with readyToStream flag if set
			if (video.readyToStream && cfState !== 'error') {
				state = 'ready';
			}

			if (cfState === 'error') {
				errorReason =
					video.status?.errorReasonText ||
					video.status?.errorReasonCode ||
					'Video processing failed';
			}

			const statusData = {
				uid,
				state,
				pctComplete:
					video.status?.pctComplete != null ? parseFloat(video.status.pctComplete) : undefined,
				errorReason,
				duration: video.duration,
				readyToStream: video.readyToStream,
				size: video.size,
				created: video.created
			};

			// Cache ready/error states in KV for 60 seconds
			if (env.VIDEO_STATUS && (state === 'ready' || state === 'error')) {
				await env.VIDEO_STATUS.put(uid, JSON.stringify(statusData), { expirationTtl: 60 });
			}

			return json(statusData, 200, CORS_STATUS);
		} catch (e) {
			console.error('Status check error:', e);
			return error('STATUS_FAILED', e.message || 'Failed to get video status', 500, CORS_STATUS);
		}
	}

	return error('NOT_FOUND', 'Stream endpoint not found', 404);
}

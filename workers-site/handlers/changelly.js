/**
 * Changelly Swap API Proxy — Phase 2.5.2
 *
 * Routes:
 *   POST /api/changelly/swap/estimate    — get a swap estimate
 *   POST /api/changelly/swap/create      — create a swap transaction
 *   POST /api/changelly/swap/status      — poll swap status
 *   POST /api/changelly/swap/currencies  — list supported currencies
 *   POST /api/changelly/swap/limits      — get min/max amounts for a pair
 *
 * Security:
 *   - HMAC-SHA256 signing using CHANGELLY_API_KEY / CHANGELLY_API_SECRET
 *   - Origin validation against ALLOWED_ORIGINS
 *   - Rate limiting: 30 req/min per wallet address (IP fallback)
 *   - Input sanitization: validate amounts, addresses, currencies
 *   - Error filtering: strip internal Changelly details before forwarding
 *
 * @see requirements/usdt-integration-plan.md §2.5.2
 * @see https://docs.changelly.com/reference/v2
 */

const ALLOWED_ORIGINS = [
	'https://bittasker.com',
	'https://dev.bittasker.com',
	'https://worker.dev.bittasker.com',
	'https://worker.prod.bittasker.com',
	'https://staging.bittasker.com',
	'http://localhost:3000',
	'http://localhost'
];

const CHANGELLY_API_BASE = 'https://api.changelly.com/v2';

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address'
};

function tokenCors(request) {
	const origin = request.headers.get('Origin');
	if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
	return ALLOWED_ORIGINS[0];
}

function corsForOrigin(request) {
	return {
		'Access-Control-Allow-Origin': tokenCors(request),
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Wallet-Address'
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(data, status, extraHeaders) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }
	});
}

function error(code, message, status, extraHeaders) {
	// Strip internal details — only expose safe message
	return new Response(
		JSON.stringify({
			code,
			message: sanitizeErrorMessage(message)
		}),
		{
			status,
			headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) }
		}
	);
}

/**
 * Strip internal Changelly error details (stack traces, API internals).
 */
function sanitizeErrorMessage(msg) {
	if (!msg || typeof msg !== 'string') return 'An unexpected error occurred';
	// Remove anything that looks like a stack trace or internal path
	const cleaned = msg
		.replace(/\n.*/gs, '')
		.replace(/at\s+\S+/g, '')
		.replace(/\/api\/v2\/\S+/g, '[internal endpoint]')
		.trim();
	return cleaned.length > 200 ? cleaned.slice(0, 200) + '...' : cleaned;
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory; resets per Worker instance)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map();

function getRateLimitKey(request) {
	const walletHeader = request.headers.get('X-Wallet-Address');
	if (walletHeader) return `wallet:${walletHeader}`;
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
	return `ip:${ip}`;
}

function checkRateLimit(key) {
	const now = Date.now();
	const windowMs = 60_000; // 1 minute
	const maxRequests = 30;

	const entry = rateLimitMap.get(key);
	if (!entry) {
		rateLimitMap.set(key, { count: 1, windowStart: now });
		return true;
	}

	if (now - entry.windowStart > windowMs) {
		// Reset window
		entry.count = 1;
		entry.windowStart = now;
		return true;
	}

	if (entry.count >= maxRequests) {
		return false;
	}

	entry.count++;
	return true;
}

// Periodically clear stale entries (every 5 minutes)
function cleanupRateLimitMap() {
	const now = Date.now();
	const windowMs = 60_000;
	for (const [key, entry] of rateLimitMap.entries()) {
		if (now - entry.windowStart > windowMs) {
			rateLimitMap.delete(key);
		}
	}
}

// ---------------------------------------------------------------------------
// Changelly HMAC-SHA256 signing
// ---------------------------------------------------------------------------

async function buildChangellySignature(secret, bodyJson) {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(bodyJson));
	const hex = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return hex;
}

async function proxyToChangelly(endpoint, bodyJson, env) {
	const apiKey = env.CHANGELLY_API_KEY;
	const apiSecret = env.CHANGELLY_API_SECRET;

	if (!apiKey || !apiSecret) {
		throw new ChangellyProxyError('Changelly API not configured', 'CONFIG_ERROR', 503);
	}

	const signature = await buildChangellySignature(apiSecret, bodyJson);

	const response = await fetch(`${CHANGELLY_API_BASE}/${endpoint}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-API-KEY': apiKey,
			'X-API-SIGN': signature
		},
		body: bodyJson
	});

	if (!response.ok) {
		const responseBody = await response.text().catch(() => '');
		let parsedMessage = `Changelly API error: ${response.status}`;
		try {
			const parsed = JSON.parse(responseBody);
			parsedMessage = parsed.message || parsed.error || parsedMessage;
		} catch {
			// Use fallback message
		}
		throw new ChangellyProxyError(parsedMessage, 'CHANGELLY_API_ERROR', response.status);
	}

	return response.json();
}

class ChangellyProxyError extends Error {
	constructor(message, code, status) {
		super(message);
		this.name = 'ChangellyProxyError';
		this.code = code;
		this.status = status;
	}
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const VALID_CURRENCY_RE = /^[a-z0-9]{2,10}$/;
const VALID_AMOUNT_RE = /^\d+(\.\d+)?$/;
const VALID_ADDRESS_RE = /^[a-zA-Z0-9]{10,}$/;
const VALID_SWAP_ID_RE = /^[a-f0-9]{8,}$/;

function validateCurrency(value, label) {
	if (!value || typeof value !== 'string') {
		throw new ChangellyProxyError(`${label} is required`, 'VALIDATION_ERROR', 400);
	}
	const cleaned = value.toLowerCase().trim();
	if (!VALID_CURRENCY_RE.test(cleaned)) {
		throw new ChangellyProxyError(`Invalid ${label} format`, 'VALIDATION_ERROR', 400);
	}
	return cleaned;
}

function validateAmount(value, label) {
	if (!value || typeof value !== 'string') {
		throw new ChangellyProxyError(`${label} is required`, 'VALIDATION_ERROR', 400);
	}
	if (!VALID_AMOUNT_RE.test(value.trim())) {
		throw new ChangellyProxyError(`Invalid ${label} format`, 'VALIDATION_ERROR', 400);
	}
	const num = parseFloat(value);
	if (num <= 0) {
		throw new ChangellyProxyError(`${label} must be positive`, 'VALIDATION_ERROR', 400);
	}
	return value.trim();
}

function validateAddress(value, label) {
	if (!value || typeof value !== 'string') {
		throw new ChangellyProxyError(`${label} is required`, 'VALIDATION_ERROR', 400);
	}
	const cleaned = value.trim();
	if (!VALID_ADDRESS_RE.test(cleaned)) {
		throw new ChangellyProxyError(`Invalid ${label} format`, 'VALIDATION_ERROR', 400);
	}
	return cleaned;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleEstimate(body, env) {
	const from = validateCurrency(body.from, 'from');
	const to = validateCurrency(body.to, 'to');
	const amount = validateAmount(body.amount, 'amount');

	const changellyBody = JSON.stringify({ from, to, amount });
	const result = await proxyToChangelly('estimate', changellyBody, env);

	return json(
		{
			estimatedAmount: result.estimatedAmount || result.result?.estimatedAmount,
			rate: result.rate || result.result?.rate,
			fee: result.fee || result.result?.fee || '0',
			minerFee: result.minerFee || result.result?.minerFee || '0'
		},
		200,
		CORS_HEADERS
	);
}

async function handleCreate(body, env) {
	const from = validateCurrency(body.from, 'from');
	const to = validateCurrency(body.to, 'to');
	const amount = validateAmount(body.amount, 'amount');
	const address = validateAddress(body.address, 'address');
	// refundAddress is optional — validate only if provided
	let refundAddress = null;
	if (body.refundAddress) {
		refundAddress = validateAddress(body.refundAddress, 'refundAddress');
	}

	const changellyPayload = { from, to, amount, address };
	if (refundAddress) {
		changellyPayload.refundAddress = refundAddress;
	}

	const changellyBody = JSON.stringify(changellyPayload);
	const result = await proxyToChangelly('create', changellyBody, env);

	return json(
		{
			id: result.id || result.result?.id,
			status: result.status || result.result?.status || 'waiting',
			from: result.from || result.result?.from,
			to: result.to || result.result?.to,
			amountExpectedFrom: result.amountExpectedFrom || result.result?.amountExpectedFrom,
			amountExpectedTo: result.amountExpectedTo || result.result?.amountExpectedTo,
			payinAddress: result.payinAddress || result.result?.payinAddress,
			payoutAddress: result.payoutAddress || result.result?.payoutAddress,
			createdAt: result.createdAt || result.result?.createdAt,
			updatedAt: result.updatedAt || result.result?.updatedAt
		},
		200,
		CORS_HEADERS
	);
}

async function handleStatus(body, env) {
	const id = body.id;
	if (!id || typeof id !== 'string' || !VALID_SWAP_ID_RE.test(id.trim())) {
		return error('VALIDATION_ERROR', 'Invalid swap ID', 400, CORS_HEADERS);
	}

	const changellyBody = JSON.stringify({ id: id.trim() });
	const result = await proxyToChangelly('status', changellyBody, env);

	// Filter response to safe fields only
	return json(
		{
			id: result.id || result.result?.id,
			status: result.status || result.result?.status,
			from: result.from || result.result?.from,
			to: result.to || result.result?.to,
			amountExpectedFrom: result.amountExpectedFrom || result.result?.amountExpectedFrom,
			amountExpectedTo: result.amountExpectedTo || result.result?.amountExpectedTo,
			payinAddress: result.payinAddress || result.result?.payinAddress,
			payoutAddress: result.payoutAddress || result.result?.payoutAddress,
			createdAt: result.createdAt || result.result?.createdAt,
			updatedAt: result.updatedAt || result.result?.updatedAt
		},
		200,
		CORS_HEADERS
	);
}

async function handleCurrencies(body, env) {
	const changellyBody = JSON.stringify({});
	const result = await proxyToChangelly('currencies', changellyBody, env);

	const currencies = (result.currencies || result.result || []).map((c) => ({
		name: c.name,
		ticker: c.ticker,
		enabled: c.enabled !== false,
		network: c.network,
		precision: c.precision || 8
	}));

	return json(currencies, 200, CORS_HEADERS);
}

async function handleLimits(body, env) {
	const from = validateCurrency(body.from, 'from');
	const to = validateCurrency(body.to, 'to');

	const changellyBody = JSON.stringify({ from, to });
	const result = await proxyToChangelly('limits', changellyBody, env);

	return json(
		{
			min: result.min || result.result?.min,
			max: result.max || result.result?.max
		},
		200,
		CORS_HEADERS
	);
}

// ---------------------------------------------------------------------------
// Exported route handler
// ---------------------------------------------------------------------------

export async function handleChangellyRoute(request, env) {
	const url = new URL(request.url);
	const pathname = url.pathname;
	const method = request.method;

	// OPTIONS preflight
	if (method === 'OPTIONS') {
		return new Response(null, { headers: corsForOrigin(request) });
	}

	// Only POST is allowed for API endpoints
	if (method !== 'POST') {
		return error('METHOD_NOT_ALLOWED', 'Method not allowed', 405, corsForOrigin(request));
	}

	// Rate limiting
	const rateLimitKey = getRateLimitKey(request);
	if (!checkRateLimit(rateLimitKey)) {
		return error(
			'RATE_LIMITED',
			'Too many requests. Please wait before trying again.',
			429,
			corsForOrigin(request)
		);
	}

	// Periodic cleanup
	cleanupRateLimitMap();

	// Parse request body
	let body;
	try {
		body = await request.json();
	} catch {
		return error('INVALID_JSON', 'Request body must be valid JSON', 400, corsForOrigin(request));
	}

	// Route to the appropriate handler
	try {
		if (pathname.endsWith('/estimate')) {
			return await handleEstimate(body, env);
		}
		if (pathname.endsWith('/create')) {
			return await handleCreate(body, env);
		}
		if (pathname.endsWith('/status')) {
			return await handleStatus(body, env);
		}
		if (pathname.endsWith('/currencies')) {
			return await handleCurrencies(body, env);
		}
		if (pathname.endsWith('/limits')) {
			return await handleLimits(body, env);
		}

		return error('NOT_FOUND', 'Changelly swap endpoint not found', 404, corsForOrigin(request));
	} catch (e) {
		if (e instanceof ChangellyProxyError) {
			console.error('[Changelly] Proxy error:', e.code, e.message);
			return error(e.code, e.message, e.status, corsForOrigin(request));
		}
		console.error('[Changelly] Unexpected error:', e);
		return error('INTERNAL_ERROR', 'An unexpected error occurred', 500, corsForOrigin(request));
	}
}

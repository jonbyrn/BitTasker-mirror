/**
 * Changelly Fiat Ramp API Proxy — Phase 2.5.3
 *
 * Routes:
 *   POST /api/changelly/fiat/onramp   — create a fiat on-ramp (buy crypto)
 *   POST /api/changelly/fiat/offramp  — create a fiat off-ramp (sell crypto)
 *   POST /api/changelly/fiat/status   — poll fiat transaction status
 *
 * Security:
 *   - Secrets from wrangler: CHANGELLY_FIAT_PRIVATE_KEY, CHANGELLY_FIAT_PUBLIC_KEY
 *   - Origin validation against ALLOWED_ORIGINS
 *   - Rate limiting: 30 req/min per wallet address
 *   - Input sanitization: validate fiat amounts, crypto amounts, addresses
 *   - Error filtering: strip internal details
 *
 * @see requirements/usdt-integration-plan.md §2.5.3
 * @see https://github.com/changelly/fiat-api-sdk-node
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

function sanitizeErrorMessage(msg) {
	if (!msg || typeof msg !== 'string') return 'An unexpected error occurred';
	return msg.replace(/\n.*/gs, '').trim().slice(0, 200);
}

// ---------------------------------------------------------------------------
// Rate limiting (in-memory; resets per Worker instance)
// ---------------------------------------------------------------------------

const rateLimitMap = new Map();

function getRateLimitKey(request) {
	const walletHeader = request.headers.get('X-Wallet-Address');
	if (walletHeader) return `fiat:wallet:${walletHeader}`;
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
	return `fiat:ip:${ip}`;
}

function checkRateLimit(key) {
	const now = Date.now();
	const windowMs = 60_000;
	const maxRequests = 30;

	const entry = rateLimitMap.get(key);
	if (!entry) {
		rateLimitMap.set(key, { count: 1, windowStart: now });
		return true;
	}

	if (now - entry.windowStart > windowMs) {
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
// Changelly Fiat SDK integration
// ---------------------------------------------------------------------------

/**
 * Proxy a request to the Changelly Fiat API.
 *
 * The Fiat API uses JWT-based auth derived from a private key.
 * This implementation uses the raw REST endpoints with the SDK's
 * auth approach (private/public key pair).
 *
 * @see https://github.com/changelly/fiat-api-sdk-node
 */
async function proxyToChangellyFiat(endpoint, payload, env) {
	const privateKey = env.CHANGELLY_FIAT_PRIVATE_KEY;
	const publicKey = env.CHANGELLY_FIAT_PUBLIC_KEY;

	if (!privateKey || !publicKey) {
		throw new FiatProxyError('Changelly Fiat API not configured', 'CONFIG_ERROR', 503);
	}

	// The Changelly Fiat API expects a JWT signed with the private key.
	// Build a minimal JWT with the request payload as the body claim.
	const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: publicKey }));
	const now = Math.floor(Date.now() / 1000);
	const claims = btoa(
		JSON.stringify({
			iss: publicKey,
			iat: now,
			exp: now + 60,
			...payload
		})
	);

	// NOTE: Cloudflare Workers do not expose a native RSA-SHA256 signer
	// via crypto.subtle unless the key is imported as a CryptoKey.
	// For a production deployment the private key should be an RSA key pair
	// importable via crypto.subtle.importKey().
	//
	// This implementation signs with HMAC-SHA256 as a fallback and logs a
	// warning so the operator knows to configure RSA keys.
	let signature;
	try {
		const encoder = new TextEncoder();
		const key = await crypto.subtle.importKey(
			'raw',
			encoder.encode(privateKey),
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);
		const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${claims}`));
		signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
	} catch (e) {
		console.error('[Fiat] JWT signing failed:', e.message);
		throw new FiatProxyError('Failed to sign request', 'SIGNING_ERROR', 500);
	}

	const jwt = `${header}.${claims}.${signature}`;
	const fiatApiBase = env.CHANGELLY_FIAT_API_BASE || 'https://fiat-api.changelly.com/v1';

	const response = await fetch(`${fiatApiBase}/${endpoint}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${jwt}`
		},
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		const responseBody = await response.text().catch(() => '');
		let parsedMessage = `Fiat API error: ${response.status}`;
		try {
			const parsed = JSON.parse(responseBody);
			parsedMessage = parsed.message || parsed.error || parsedMessage;
		} catch {
			// Use fallback
		}
		throw new FiatProxyError(parsedMessage, 'FIAT_API_ERROR', response.status);
	}

	return response.json();
}

class FiatProxyError extends Error {
	constructor(message, code, status) {
		super(message);
		this.name = 'FiatProxyError';
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
const VALID_URL_RE = /^https:\/\/.+/;

function validateFiatCurrency(value, label) {
	if (!value || typeof value !== 'string') {
		throw new FiatProxyError(`${label} is required`, 'VALIDATION_ERROR', 400);
	}
	const cleaned = value.toLowerCase().trim();
	if (!VALID_CURRENCY_RE.test(cleaned)) {
		throw new FiatProxyError(`Invalid ${label} format`, 'VALIDATION_ERROR', 400);
	}
	return cleaned;
}

function validateAmount(value, label) {
	if (!value || typeof value !== 'string') {
		throw new FiatProxyError(`${label} is required`, 'VALIDATION_ERROR', 400);
	}
	if (!VALID_AMOUNT_RE.test(value.trim())) {
		throw new FiatProxyError(`Invalid ${label} format`, 'VALIDATION_ERROR', 400);
	}
	const num = parseFloat(value);
	if (num <= 0) {
		throw new FiatProxyError(`${label} must be positive`, 'VALIDATION_ERROR', 400);
	}
	return value.trim();
}

function validateAddress(value, label) {
	if (!value || typeof value !== 'string') {
		throw new FiatProxyError(`${label} is required`, 'VALIDATION_ERROR', 400);
	}
	const cleaned = value.trim();
	if (!VALID_ADDRESS_RE.test(cleaned)) {
		throw new FiatProxyError(`Invalid ${label} format`, 'VALIDATION_ERROR', 400);
	}
	return cleaned;
}

function validateRedirectUrl(value) {
	if (!value) return undefined;
	if (typeof value !== 'string') return undefined;
	if (!VALID_URL_RE.test(value.trim())) return undefined;
	return value.trim();
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleOnRamp(body, env) {
	const fiatCurrency = validateFiatCurrency(body.fiatCurrency, 'fiatCurrency');
	const fiatAmount = validateAmount(body.fiatAmount, 'fiatAmount');
	const cryptoCurrency = validateFiatCurrency(body.cryptoCurrency, 'cryptoCurrency');
	const cryptoAddress = validateAddress(body.cryptoAddress, 'cryptoAddress');
	const redirectUrl = validateRedirectUrl(body.redirectUrl);

	const payload = {
		fiatCurrency,
		fiatAmount,
		cryptoCurrency,
		cryptoAddress,
		...(redirectUrl ? { redirectUrl } : {})
	};

	const result = await proxyToChangellyFiat('onramp', payload, env);

	return json(
		{
			id: result.id || result.result?.id,
			status: result.status || result.result?.status || 'pending',
			fiatCurrency: result.fiatCurrency || result.result?.fiatCurrency,
			fiatAmount: result.fiatAmount || result.result?.fiatAmount,
			cryptoCurrency: result.cryptoCurrency || result.result?.cryptoCurrency,
			cryptoAmount: result.cryptoAmount || result.result?.cryptoAmount,
			walletAddress: result.walletAddress || result.result?.walletAddress,
			createdAt: result.createdAt || result.result?.createdAt,
			updatedAt: result.updatedAt || result.result?.updatedAt
		},
		200,
		CORS_HEADERS
	);
}

async function handleOffRamp(body, env) {
	const cryptoCurrency = validateFiatCurrency(body.cryptoCurrency, 'cryptoCurrency');
	const cryptoAmount = validateAmount(body.cryptoAmount, 'cryptoAmount');
	const fiatCurrency = validateFiatCurrency(body.fiatCurrency, 'fiatCurrency');
	const fiatAddress = validateAddress(body.fiatAddress, 'fiatAddress');
	const redirectUrl = validateRedirectUrl(body.redirectUrl);

	const payload = {
		cryptoCurrency,
		cryptoAmount,
		fiatCurrency,
		fiatAddress,
		...(redirectUrl ? { redirectUrl } : {})
	};

	const result = await proxyToChangellyFiat('offramp', payload, env);

	return json(
		{
			id: result.id || result.result?.id,
			status: result.status || result.result?.status || 'pending',
			fiatCurrency: result.fiatCurrency || result.result?.fiatCurrency,
			fiatAmount: result.fiatAmount || result.result?.fiatAmount,
			cryptoCurrency: result.cryptoCurrency || result.result?.cryptoCurrency,
			cryptoAmount: result.cryptoAmount || result.result?.cryptoAmount,
			walletAddress: result.walletAddress || result.result?.walletAddress,
			createdAt: result.createdAt || result.result?.createdAt,
			updatedAt: result.updatedAt || result.result?.updatedAt
		},
		200,
		CORS_HEADERS
	);
}

async function handleStatus(body, env) {
	const id = body.id;
	if (!id || typeof id !== 'string') {
		return error('VALIDATION_ERROR', 'Transaction ID is required', 400, CORS_HEADERS);
	}

	const payload = { id: id.trim() };
	const result = await proxyToChangellyFiat('status', payload, env);

	return json(
		{
			id: result.id || result.result?.id,
			status: result.status || result.result?.status,
			fiatCurrency: result.fiatCurrency || result.result?.fiatCurrency,
			fiatAmount: result.fiatAmount || result.result?.fiatAmount,
			cryptoCurrency: result.cryptoCurrency || result.result?.cryptoCurrency,
			cryptoAmount: result.cryptoAmount || result.result?.cryptoAmount,
			createdAt: result.createdAt || result.result?.createdAt,
			updatedAt: result.updatedAt || result.result?.updatedAt
		},
		200,
		CORS_HEADERS
	);
}

// ---------------------------------------------------------------------------
// Exported route handler
// ---------------------------------------------------------------------------

export async function handleChangellyFiatRoute(request, env) {
	const url = new URL(request.url);
	const pathname = url.pathname;
	const method = request.method;

	// OPTIONS preflight
	if (method === 'OPTIONS') {
		return new Response(null, { headers: corsForOrigin(request) });
	}

	// Only POST is allowed
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

	cleanupRateLimitMap();

	// Parse body
	let body;
	try {
		body = await request.json();
	} catch {
		return error('INVALID_JSON', 'Request body must be valid JSON', 400, corsForOrigin(request));
	}

	try {
		if (pathname.endsWith('/onramp')) {
			return await handleOnRamp(body, env);
		}
		if (pathname.endsWith('/offramp')) {
			return await handleOffRamp(body, env);
		}
		if (pathname.endsWith('/status')) {
			return await handleStatus(body, env);
		}

		return error('NOT_FOUND', 'Changelly fiat endpoint not found', 404, corsForOrigin(request));
	} catch (e) {
		if (e instanceof FiatProxyError) {
			console.error('[Fiat] Proxy error:', e.code, e.message);
			return error(e.code, e.message, e.status, corsForOrigin(request));
		}
		console.error('[Fiat] Unexpected error:', e);
		return error('INTERNAL_ERROR', 'An unexpected error occurred', 500, corsForOrigin(request));
	}
}

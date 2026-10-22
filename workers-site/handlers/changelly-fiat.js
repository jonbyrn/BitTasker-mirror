/**
 * Changelly Fiat On-Ramp proxy.
 *
 * The browser calls this Worker. The Worker signs the request with the
 * Fiat API RSA private key and forwards it to Changelly. The private key
 * is read from the Worker env and is never returned.
 *
 *   POST /api/changelly/fiat/status     — { configured } only. No key material.
 *   POST /api/changelly/fiat/countries  — countries from GET /v1/available-countries
 *   POST /api/changelly/fiat/offers     — quote a BTC purchase
 *   POST /api/changelly/fiat/orders     — create that purchase to the user's address
 *
 * Secrets (wrangler secret put, never wrangler vars):
 *   CHANGELLY_FIAT_API_KEY     public API key (X-Api-Key)
 *   CHANGELLY_FIAT_API_SECRET  RSA private key PEM (PKCS#1 or PKCS#8)
 *
 * Optional:
 *   CHANGELLY_FIAT_API_BASE    defaults to https://fiat-api.changelly.com
 *                              Sandbox uses the same host with sandbox keys.
 *
 * Signing: RSA-SHA256 over `url + JSON.stringify(body)`. GET quotes sign `{}`.
 * @see https://fiat-api.changelly.com/docs/integration-guide/send-a-request
 * @see docs/FIAT_ONRAMP_CHANGELLY.md
 */

const ALLOWED_ORIGINS = [
	'https://bittasker.com',
	'https://www.bittasker.com',
	'https://dev.bittasker.com',
	'https://worker.dev.bittasker.com',
	'https://worker.prod.bittasker.com',
	'https://staging.bittasker.com',
	'https://rgb.bittasker.com',
	'http://localhost:3000',
	'http://localhost',
	'http://127.0.0.1:3000'
];

const DEFAULT_API_BASE = 'https://fiat-api.changelly.com';
const RSA_ALGORITHM_ID = Uint8Array.of(
	0x30,
	0x0d,
	0x06,
	0x09,
	0x2a,
	0x86,
	0x48,
	0x86,
	0xf7,
	0x0d,
	0x01,
	0x01,
	0x01,
	0x05,
	0x00
);

const rateLimitMap = new Map();

export function resetChangellyFiatProxyState() {
	rateLimitMap.clear();
}

function tokenCors(request) {
	const origin = request.headers.get('Origin');
	if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
	return ALLOWED_ORIGINS[0];
}

function corsForOrigin(request) {
	return {
		'Access-Control-Allow-Origin': tokenCors(request),
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Cache-Control': 'no-store'
	};
}

function json(data, status, extraHeaders) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders }
	});
}

function error(code, message, status, extraHeaders) {
	return json({ code, message: sanitizeErrorMessage(message) }, status, extraHeaders);
}

function sanitizeErrorMessage(msg) {
	if (!msg || typeof msg !== 'string') return 'An unexpected error occurred';
	return msg
		.replace(/\n.*/gs, '')
		.replace(/-----BEGIN[\s\S]*$/g, '')
		.trim()
		.slice(0, 200);
}

class FiatProxyError extends Error {
	constructor(message, code, status) {
		super(message);
		this.name = 'FiatProxyError';
		this.code = code;
		this.status = status;
	}
}

function checkRateLimit(request) {
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
	const key = `fiat:${ip}`;
	const now = Date.now();
	const windowMs = 60_000;
	const maxRequests = 30;
	const entry = rateLimitMap.get(key);
	if (!entry || now - entry.windowStart > windowMs) {
		rateLimitMap.set(key, { count: 1, windowStart: now });
		return true;
	}
	if (entry.count >= maxRequests) return false;
	entry.count += 1;
	return true;
}

function derLength(length) {
	if (length < 0x80) return Uint8Array.of(length);
	if (length <= 0xff) return Uint8Array.of(0x81, length);
	if (length <= 0xffff) return Uint8Array.of(0x82, (length >> 8) & 0xff, length & 0xff);
	throw new FiatProxyError('Private key is too large to import', 'CONFIG_ERROR', 503);
}

function derWrap(tag, content) {
	const length = derLength(content.length);
	const out = new Uint8Array(1 + length.length + content.length);
	out[0] = tag;
	out.set(length, 1);
	out.set(content, 1 + length.length);
	return out;
}

function concatBytes(parts) {
	const size = parts.reduce((sum, part) => sum + part.length, 0);
	const out = new Uint8Array(size);
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

/** Wrap a PKCS#1 RSA key so Web Crypto can import it as PKCS#8. */
export function pkcs1ToPkcs8(pkcs1) {
	const version = Uint8Array.of(0x02, 0x01, 0x00);
	return derWrap(0x30, concatBytes([version, RSA_ALGORITHM_ID, derWrap(0x04, pkcs1)]));
}

function decodeBase64(body) {
	const binary = atob(body);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function bytesToBase64(bytes) {
	let binary = '';
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function pemBytes(secret) {
	let text = String(secret || '').trim();
	if (!text.includes('BEGIN') && /^[A-Za-z0-9+/=\s]+$/.test(text)) {
		try {
			const decoded = atob(text.replace(/\s+/g, ''));
			if (decoded.includes('BEGIN')) text = decoded;
		} catch {
			// The value is not a base64 PEM wrapper.
		}
	}
	text = text.replace(/\\n/g, '\n');
	const pkcs1 = /BEGIN RSA PRIVATE KEY/.test(text);
	const pkcs8 = /BEGIN PRIVATE KEY/.test(text);
	if (!pkcs1 && !pkcs8) {
		throw new FiatProxyError(
			'CHANGELLY_FIAT_API_SECRET must be a PEM RSA private key',
			'CONFIG_ERROR',
			503
		);
	}
	const body = text
		.replace(/-----BEGIN [^-]+-----/g, '')
		.replace(/-----END [^-]+-----/g, '')
		.replace(/\s+/g, '');
	const der = decodeBase64(body);
	return pkcs1 ? pkcs1ToPkcs8(der) : der;
}

async function importPrivateKey(secret) {
	return crypto.subtle.importKey(
		'pkcs8',
		pemBytes(secret),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
}

/**
 * Sign `url + bodyText` the way the Fiat API requires.
 * bodyText for a GET quote is `{}`.
 */
export async function signFiatRequest(privateKeyPem, url, bodyText) {
	const key = await importPrivateKey(privateKeyPem);
	const payload = `${url}${bodyText}`;
	const signature = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		new TextEncoder().encode(payload)
	);
	return bytesToBase64(new Uint8Array(signature));
}

function apiBase(env) {
	const configured =
		typeof env.CHANGELLY_FIAT_API_BASE === 'string' ? env.CHANGELLY_FIAT_API_BASE.trim() : '';
	if (!configured) return DEFAULT_API_BASE;
	if (!/^https:\/\/[a-z0-9.-]+$/i.test(configured.replace(/\/$/, ''))) {
		throw new FiatProxyError(
			'CHANGELLY_FIAT_API_BASE must be an https origin',
			'CONFIG_ERROR',
			503
		);
	}
	return configured.replace(/\/$/, '');
}

function requireKeys(env) {
	const apiKey =
		typeof env.CHANGELLY_FIAT_API_KEY === 'string' ? env.CHANGELLY_FIAT_API_KEY.trim() : '';
	const apiSecret =
		typeof env.CHANGELLY_FIAT_API_SECRET === 'string' ? env.CHANGELLY_FIAT_API_SECRET.trim() : '';
	if (!apiKey || !apiSecret || apiKey === 'dev-placeholder' || apiSecret === 'dev-placeholder') {
		throw new FiatProxyError('Changelly Fiat API is not configured', 'CONFIG_ERROR', 503);
	}
	if (apiKey.includes('PRIVATE KEY') || apiSecret.includes('PUBLIC KEY')) {
		throw new FiatProxyError('Changelly Fiat API key and secret look swapped', 'CONFIG_ERROR', 503);
	}
	return { apiKey, apiSecret };
}

async function changellyFetch(env, method, pathAndQuery, bodyObject) {
	const { apiKey, apiSecret } = requireKeys(env);
	const url = `${apiBase(env)}${pathAndQuery}`;
	const bodyText = JSON.stringify(bodyObject);
	const signature = await signFiatRequest(apiSecret, url, bodyText);
	const response = await fetch(url, {
		method,
		headers: {
			'Content-Type': 'application/json',
			'X-Api-Key': apiKey,
			'X-Api-Signature': signature
		},
		body: method === 'GET' ? undefined : bodyText
	});
	const responseText = await response.text();
	if (!response.ok) {
		let message = `Changelly Fiat API returned ${response.status}`;
		let code = 'FIAT_API_ERROR';
		try {
			const parsed = JSON.parse(responseText);
			message = parsed.errorMessage || parsed.message || message;
			if (parsed.errorType) code = String(parsed.errorType).slice(0, 40);
			const detail = Array.isArray(parsed.errorDetails) ? parsed.errorDetails[0] : null;
			if (detail?.cause && detail?.value) {
				message = `${message} (${detail.cause} ${detail.value})`;
			}
		} catch {
			// Keep the status fallback. Never forward the raw body.
		}
		const status = response.status === 401 ? 503 : response.status >= 500 ? 502 : 400;
		if (response.status === 401) {
			message = 'Changelly rejected the API key';
			code = 'CONFIG_ERROR';
		}
		throw new FiatProxyError(message, code, status);
	}
	try {
		return JSON.parse(responseText);
	} catch {
		throw new FiatProxyError(
			'Changelly returned a response that was not JSON',
			'FIAT_API_ERROR',
			502
		);
	}
}

export function isMainnetBtcAddress(value) {
	if (typeof value !== 'string') return false;
	const address = value.trim();
	if (!address || /\s/.test(address)) return false;
	if (/^bc1[qp][ac-hj-np-z02-9]{38,87}$/.test(address)) return true;
	return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
}

function isIp(value) {
	if (typeof value !== 'string') return false;
	const candidate = value.trim();
	if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(candidate)) {
		return candidate.split('.').every((part) => Number(part) <= 255);
	}
	return /^[0-9a-fA-F:]{2,45}$/.test(candidate) && candidate.includes(':');
}

function clientIp(request, bodyIp) {
	const header = request.headers.get('CF-Connecting-IP');
	if (header && isIp(header)) return header.trim();
	if (typeof bodyIp === 'string' && isIp(bodyIp)) return bodyIp.trim();
	return null;
}

function requireAmount(value) {
	if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value.trim())) {
		throw new FiatProxyError('amountFrom must be a fiat amount', 'VALIDATION_ERROR', 400);
	}
	const amount = Number(value);
	if (!(amount > 0) || amount > 100000) {
		throw new FiatProxyError('amountFrom is outside the accepted range', 'VALIDATION_ERROR', 400);
	}
	return value.trim();
}

function requireCountry(value) {
	if (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value.trim())) {
		throw new FiatProxyError('country must be an ISO alpha-2 code', 'VALIDATION_ERROR', 400);
	}
	return value.trim();
}

function requireFiatCurrency(value) {
	if (typeof value !== 'string' || !/^[A-Z]{3,10}$/.test(value.trim()) || value.trim() === 'BTC') {
		throw new FiatProxyError('currencyFrom must be a fiat ticker', 'VALIDATION_ERROR', 400);
	}
	return value.trim();
}

function requireBtcPayout(value) {
	if (typeof value !== 'string') {
		throw new FiatProxyError('currencyTo is required', 'VALIDATION_ERROR', 400);
	}
	const ticker = value.trim().toUpperCase();
	if (ticker !== 'BTC') {
		throw new FiatProxyError(
			'USDT cannot be delivered to the RGB wallet. Changelly has no RGB network. Buy BTC, which is paid to your own Bitcoin address.',
			'USDT_NOT_RGB',
			400
		);
	}
	return 'BTC';
}

function optionalState(country, value) {
	if (country === 'US' && (typeof value !== 'string' || !/^[A-Z]{2}$/.test(value.trim()))) {
		throw new FiatProxyError('state is required for the United States', 'VALIDATION_ERROR', 400);
	}
	if (value == null || value === '') return undefined;
	if (typeof value !== 'string' || !/^[A-Z0-9]{1,3}$/.test(value.trim())) {
		throw new FiatProxyError('state must be an ISO 3166-2 code', 'VALIDATION_ERROR', 400);
	}
	return value.trim();
}

function optionalCode(value, label) {
	if (value == null || value === '') return undefined;
	if (typeof value !== 'string' || !/^[a-z0-9_-]{2,40}$/i.test(value.trim())) {
		throw new FiatProxyError(`${label} is invalid`, 'VALIDATION_ERROR', 400);
	}
	return value.trim();
}

function optionalId(value, label) {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(value.trim())) {
		throw new FiatProxyError(`${label} is invalid`, 'VALIDATION_ERROR', 400);
	}
	return value.trim();
}

function optionalReturnUrl(value) {
	if (value == null || value === '') return undefined;
	let url;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
		return undefined;
	}
	const origin = `${url.protocol}//${url.host}`;
	if (!ALLOWED_ORIGINS.includes(origin) && !ALLOWED_ORIGINS.includes(`${origin}/`))
		return undefined;
	if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
		return undefined;
	}
	return url.toString();
}

function keysConfigured(env) {
	try {
		requireKeys(env);
		return true;
	} catch (caught) {
		if (caught instanceof FiatProxyError && caught.code === 'CONFIG_ERROR') return false;
		throw caught;
	}
}

const QUOTE_PROVIDERS = new Set(['moonpay', 'banxa', 'wert']);

function providerCodes(row) {
	const raw = Array.isArray(row.providers) ? row.providers : [];
	const seen = new Set();
	const codes = [];
	for (const item of raw) {
		const code = String(
			item && typeof item === 'object' ? item.providerCode || item.code || '' : item || ''
		)
			.trim()
			.toLowerCase();
		if (!QUOTE_PROVIDERS.has(code) || seen.has(code)) continue;
		seen.add(code);
		codes.push(code);
	}
	return codes;
}

function normalizeCountries(result) {
	const rows = Array.isArray(result)
		? result
		: Array.isArray(result?.countries)
			? result.countries
			: Array.isArray(result?.data)
				? result.data
				: null;
	if (!rows) {
		throw new FiatProxyError('Changelly returned no countries', 'FIAT_API_ERROR', 502);
	}
	const seen = new Set();
	const countries = [];
	for (const row of rows) {
		if (!row || typeof row !== 'object') continue;
		const code = String(row.code || row.country || '')
			.trim()
			.toUpperCase();
		const name = String(row.name || row.countryName || '').trim();
		if (!/^[A-Z]{2}$/.test(code) || !name || name.length > 80 || seen.has(code)) continue;
		seen.add(code);
		const country = { code, name };
		const providers = providerCodes(row);
		if (providers.length > 0) country.providers = providers;
		countries.push(country);
	}
	countries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
	if (countries.length === 0) {
		throw new FiatProxyError('Changelly returned no countries', 'FIAT_API_ERROR', 502);
	}
	return countries;
}

function handleStatus(request, env) {
	return json({ configured: keysConfigured(env) }, 200, corsForOrigin(request));
}

async function handleCountries(request, env) {
	const result = await changellyFetch(env, 'GET', '/v1/available-countries', {});
	return json({ countries: normalizeCountries(result) }, 200, corsForOrigin(request));
}

function offersPath(params) {
	const query = new URLSearchParams();
	query.set('amountFrom', params.amountFrom);
	query.set('country', params.country);
	query.set('currencyFrom', params.currencyFrom);
	query.set('currencyTo', params.currencyTo);
	query.set('ip', params.ip);
	if (params.state) query.set('state', params.state);
	return `/v1/offers?${query.toString()}`;
}

async function handleOffers(body, request, env) {
	const amountFrom = requireAmount(body.amountFrom);
	const country = requireCountry(body.country);
	const currencyFrom = requireFiatCurrency(body.currencyFrom);
	const currencyTo = requireBtcPayout(body.currencyTo);
	const state = optionalState(country, body.state);
	const ip = clientIp(request, body.ip);
	if (!ip) throw new FiatProxyError('A client IP is required', 'VALIDATION_ERROR', 400);

	const result = await changellyFetch(
		env,
		'GET',
		offersPath({
			amountFrom,
			country,
			currencyFrom,
			currencyTo,
			ip,
			state
		}),
		{}
	);

	const offers = Array.isArray(result) ? result : result?.offers;
	if (!Array.isArray(offers)) {
		throw new FiatProxyError('Changelly returned no offers', 'FIAT_API_ERROR', 502);
	}
	const visible = offers.filter((offer) => {
		const code = String(offer && offer.providerCode ? offer.providerCode : '')
			.trim()
			.toLowerCase();
		return code !== 'transak';
	});
	return json({ offers: visible }, 200, corsForOrigin(request));
}

async function handleOrders(body, request, env) {
	const amountFrom = requireAmount(body.amountFrom);
	const country = requireCountry(body.country);
	const currencyFrom = requireFiatCurrency(body.currencyFrom);
	const currencyTo = requireBtcPayout(body.currencyTo ?? 'BTC');
	const state = optionalState(country, body.state);
	const providerCode = optionalCode(body.providerCode, 'providerCode');
	const paymentMethod = optionalCode(body.paymentMethod, 'paymentMethod');
	if (!providerCode) throw new FiatProxyError('providerCode is required', 'VALIDATION_ERROR', 400);
	if (providerCode.toLowerCase() === 'transak') {
		throw new FiatProxyError(
			'Transak is not used. Pick another offer. BitTasker does not collect identity documents.',
			'PROVIDER_BLOCKED',
			400
		);
	}
	const walletAddress = typeof body.walletAddress === 'string' ? body.walletAddress.trim() : '';
	if (!isMainnetBtcAddress(walletAddress)) {
		throw new FiatProxyError(
			"walletAddress must be the user's own mainnet Bitcoin address. Signet and RGB invoices cannot receive a Changelly payout.",
			'ADDRESS_NETWORK',
			400
		);
	}
	const ip = clientIp(request, body.ip);
	if (!ip) throw new FiatProxyError('A client IP is required', 'VALIDATION_ERROR', 400);
	const externalOrderId = optionalId(body.externalOrderId, 'externalOrderId');
	const externalUserId = optionalId(body.externalUserId, 'externalUserId');

	const validation = await changellyFetch(env, 'POST', '/v1/validate-address', {
		currency: 'BTC',
		walletAddress
	});
	if (!validation || validation.result !== true) {
		throw new FiatProxyError('Changelly rejected the Bitcoin address', 'ADDRESS_REJECTED', 400);
	}

	const order = {
		externalOrderId,
		externalUserId,
		providerCode,
		currencyFrom,
		currencyTo,
		amountFrom,
		country,
		walletAddress
	};
	if (paymentMethod) order.paymentMethod = paymentMethod;
	const returnSuccessUrl = optionalReturnUrl(body.returnSuccessUrl);
	const returnFailedUrl = optionalReturnUrl(body.returnFailedUrl);
	if (returnSuccessUrl) order.returnSuccessUrl = returnSuccessUrl;
	if (returnFailedUrl) order.returnFailedUrl = returnFailedUrl;
	if (state) order.state = state;
	order.ip = ip;

	const created = await changellyFetch(env, 'POST', '/v1/orders', order);
	if (!created?.redirectUrl || created.walletAddress !== walletAddress) {
		throw new FiatProxyError('Changelly did not confirm the payout address', 'FIAT_API_ERROR', 502);
	}
	return json(
		{
			orderId: created.orderId,
			redirectUrl: created.redirectUrl,
			walletAddress: created.walletAddress,
			providerCode: created.providerCode,
			currencyTo: created.currencyTo,
			amountFrom: created.amountFrom
		},
		200,
		corsForOrigin(request)
	);
}

export async function handleChangellyFiatRoute(request, env) {
	const url = new URL(request.url);
	const pathname = url.pathname;
	if (request.method === 'OPTIONS') {
		return new Response(null, { headers: corsForOrigin(request) });
	}
	if (request.method !== 'POST') {
		return error('METHOD_NOT_ALLOWED', 'Method not allowed', 405, corsForOrigin(request));
	}
	if (!checkRateLimit(request)) {
		return error(
			'RATE_LIMITED',
			'Too many requests. Please wait before trying again.',
			429,
			corsForOrigin(request)
		);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return error('INVALID_JSON', 'Request body must be valid JSON', 400, corsForOrigin(request));
	}
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return error('VALIDATION_ERROR', 'Request body must be an object', 400, corsForOrigin(request));
	}

	try {
		if (pathname.endsWith('/status')) return handleStatus(request, env);
		if (pathname.endsWith('/countries')) return await handleCountries(request, env);
		if (pathname.endsWith('/offers')) return await handleOffers(body, request, env);
		if (pathname.endsWith('/orders')) return await handleOrders(body, request, env);
		return error('NOT_FOUND', 'Changelly fiat endpoint not found', 404, corsForOrigin(request));
	} catch (caught) {
		if (caught instanceof FiatProxyError) {
			console.error('[Fiat] Proxy error:', caught.code);
			return error(caught.code, caught.message, caught.status, corsForOrigin(request));
		}
		console.error('[Fiat] Unexpected error');
		return error('INTERNAL_ERROR', 'An unexpected error occurred', 500, corsForOrigin(request));
	}
}

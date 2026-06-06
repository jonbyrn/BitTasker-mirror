/**
 * Blockscout API proxy for RSK — avoids browser CORS / rate-limit noise.
 *
 * GET /api/explorer/rsk/v2/* → https://rootstock.blockscout.com/api/v2/*
 * GET /api/explorer/rsk-testnet/v2/* → https://rootstock-testnet.blockscout.com/api/v2/*
 */

const ALLOWED_ORIGINS = [
	'https://bittasker.com',
	'https://dev.bittasker.com',
	'https://worker.dev.bittasker.com',
	'https://worker.prod.bittasker.com',
	'https://staging.bittasker.com',
	'http://localhost:3000'
];

const UPSTREAM = {
	rsk: 'https://rootstock.blockscout.com/api/v2',
	'rsk-testnet': 'https://rootstock-testnet.blockscout.com/api/v2'
};

function corsHeaders(request) {
	const origin = request.headers.get('Origin');
	const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
	return {
		'Access-Control-Allow-Origin': allowOrigin,
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Max-Age': '86400'
	};
}

function resolveUpstream(pathname) {
	const match = pathname.match(/^\/api\/explorer\/(rsk(?:-testnet)?)\/v2(\/.*)?$/);
	if (!match) return null;
	const network = match[1];
	const rest = match[2] || '';
	const base = UPSTREAM[network];
	if (!base) return null;
	return `${base}${rest}`;
}

export async function handleExplorerRoute(request) {
	const cors = corsHeaders(request);

	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: cors });
	}

	if (request.method !== 'GET') {
		return new Response(JSON.stringify({ error: 'Method not allowed' }), {
			status: 405,
			headers: { ...cors, 'Content-Type': 'application/json' }
		});
	}

	const url = new URL(request.url);
	const upstream = resolveUpstream(url.pathname);
	if (!upstream) {
		return new Response(JSON.stringify({ error: 'Not found' }), {
			status: 404,
			headers: { ...cors, 'Content-Type': 'application/json' }
		});
	}

	const upstreamUrl = new URL(upstream);
	upstreamUrl.search = url.search;

	try {
		const upstreamRes = await fetch(upstreamUrl.toString(), {
			headers: { Accept: 'application/json' }
		});

		const cacheControl =
			url.pathname.includes('/transactions') || url.pathname.includes('/addresses')
				? 'public, max-age=15'
				: 'public, max-age=60';

		return new Response(upstreamRes.body, {
			status: upstreamRes.status,
			headers: {
				...cors,
				'Content-Type': upstreamRes.headers.get('Content-Type') || 'application/json',
				'Cache-Control': cacheControl
			}
		});
	} catch (err) {
		return new Response(
			JSON.stringify({ error: err instanceof Error ? err.message : 'Proxy error' }),
			{ status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
		);
	}
}

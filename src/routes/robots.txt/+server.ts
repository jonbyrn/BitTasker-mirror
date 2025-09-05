import type { RequestHandler } from './$types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET: RequestHandler = async ({ url }: { url: any }) => {
	// Detectar entorno
	const isDev =
		url.hostname.includes('dev.') ||
		url.hostname.includes('localhost') ||
		url.hostname.includes('127.0.0.1') ||
		url.hostname.includes('staging.');

	if (isDev) {
		// DESARROLLO - Bloquear todo
		return new Response(
			`User-agent: *
Disallow: /

# Development environment - block all crawlers
# This prevents search engines from indexing dev/staging sites`,
			{
				headers: {
					'Content-Type': 'text/plain; charset=utf-8',
					'Cache-Control': 'no-cache'
				}
			}
		);
	}

	// PRODUCCIÓN - Permitir contenido público
	return new Response(
		`User-agent: *
Allow: /

# Disallow private/protected routes
Disallow: /dashboard/
Disallow: /auth/
Disallow: /verify-email
Disallow: /api/
Disallow: /_app/
Disallow: /admin/

# Block sensitive files
Disallow: /*.json$
Disallow: /*.js$
Disallow: /*.css$
Disallow: /manifest.json
Disallow: /firebase-messaging-sw.js

# Sitemap
Sitemap: https://bittasker.com/sitemap.xml`,
		{
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'Cache-Control': 'public, max-age=3600'
			}
		}
	);
};

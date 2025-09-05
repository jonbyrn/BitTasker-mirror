import type { RequestHandler } from './$types';
import { dev } from '$app/environment';

export const GET: RequestHandler = async ({ url }) => {
	// Detectar entorno usando múltiples métodos
	const isDev = dev || 
		url.hostname.includes('dev.') || 
		url.hostname.includes('localhost') ||
		url.hostname.includes('127.0.0.1') ||
		url.hostname.includes('staging.') ||
		process.env.NODE_ENV === 'development';

	console.log('Environment check:', {
		hostname: url.hostname,
		dev,
		isDev,
		nodeEnv: process.env.NODE_ENV
	});

	if (isDev) {
		return new Response(
			`User-agent: *
Disallow: /

# Development environment - block all crawlers
# This prevents search engines from indexing dev/staging sites`,
			{
				headers: { 'Content-Type': 'text/plain' }
			}
		);
	}

	// Producción - reglas completas
	return new Response(
		`User-agent: *
Allow: /

# Allow all public pages
Allow: /about
Allow: /careers
Allow: /contact
Allow: /faq
Allow: /how-it-works
Allow: /press
Allow: /privacy
Allow: /security
Allow: /terms
Allow: /tasker-fees
Allow: /taskee-fees
Allow: /community-guidelines
Allow: /escrow
Allow: /tasker-principles

# Block private/dashboard areas
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

# Sitemap location
Sitemap: https://bittasker.com/sitemap.xml

# Crawl delay
Crawl-delay: 1`,
		{
			headers: { 'Content-Type': 'text/plain' }
		}
	);
};

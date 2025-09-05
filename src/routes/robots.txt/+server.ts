import type { RequestHandler } from './$types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET: RequestHandler = async ({ url }: { url: any }) => {
	// Usar variable de entorno para detectar desarrollo
    const isDev = url.hostname.includes('dev.') || 
                  url.hostname.includes('localhost') ||
                  url.hostname.includes('127.0.0.1');
    
    console.log('Hostname:', url.hostname);
    console.log('isDev:', isDev);

	if (isDev) {
		return new Response(
			`User-agent: *
Disallow: /`,
			{
				headers: { 'Content-Type': 'text/plain' }
			}
		);
	}

	// Para producción, contenido normal
	return new Response(
		`User-agent: *
Allow: /

# Disallow private/protected routes
Disallow: /dashboard/
Disallow: /auth/onboarding

# Sitemap
Sitemap: https://bittasker.com/sitemap.xml`,
		{
			headers: { 'Content-Type': 'text/plain' }
		}
	);
};

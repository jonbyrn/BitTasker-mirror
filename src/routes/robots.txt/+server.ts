import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
	// Usar variable de entorno para detectar desarrollo
	const isDev = import.meta.env.VITE_NODE_ENV === 'development';

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

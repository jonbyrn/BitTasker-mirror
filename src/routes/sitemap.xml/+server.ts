import type { RequestHandler } from './$types';

const domain = 'https://bittasker.com';

export const GET: RequestHandler = async () => {
	// Define the URLs manually for better control
	const urls = [
		// Home page
		'/',
		// Company pages
		'/about',
		'/careers',
		'/tasker-fees',
		'/community-guidelines',
		'/contact',
		'/escrow',
		'/faq',
		'/how-it-works',
		'/press',
		'/privacy',
		'/security',
		'/taskee-fees',
		'/tasker-principles',
		'/terms',
		// Auth pages
		'/auth/login',
		'/auth/signup',
		'/auth/recover',
		'/verify-email'
	];

	// Generate sitemap XML manually
	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${domain}${url}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n')}
</urlset>`;

	const body = sitemap;
	
	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'public, max-age=3600' // Cache for 1 hour
		}
	});
}; 
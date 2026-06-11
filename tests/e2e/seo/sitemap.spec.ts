import { test, expect } from '@playwright/test';
import http from 'node:http';

const BASE_URL = process.env.PW_E2E_BASE_URL || 'http://localhost:3000';

function fetchText(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		http.get(url, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => resolve(data));
			res.on('error', reject);
		}).on('error', reject);
	});
}

test.describe('sitemap and robots.txt', () => {
	test('robots.txt contains expected directives', async () => {
		const robotsTxt = await fetchText(`${BASE_URL}/robots.txt`);

		const hasAllowOrUserAgent =
			robotsTxt.includes('Allow: /') || robotsTxt.includes('User-agent: *');
		expect(hasAllowOrUserAgent, 'robots.txt should contain "Allow: /" or "User-agent: *"').toBe(
			true
		);

		// Sitemap directive is only present in production builds (VITE_ROBOTS_TXT=prod).
		// Dev builds use "Disallow: /" without sitemap. Skip sitemap check for dev.
		const isProduction =
			robotsTxt.includes('Allow: /') && !robotsTxt.includes('Disallow: /');
		if (isProduction) {
			expect(
				robotsTxt.toLowerCase(),
				'robots.txt should contain sitemap directive in production'
			).toContain('sitemap');
		}
	});

	test('sitemap.xml is valid and contains bittasker.com', async () => {
		const sitemapXml = await fetchText(`${BASE_URL}/sitemap.xml`);

		const hasValidRoot =
			sitemapXml.includes('<urlset') || sitemapXml.includes('<sitemapindex');
		expect(hasValidRoot, 'sitemap.xml should contain <urlset> or <sitemapindex>').toBe(true);

		expect(sitemapXml, 'sitemap.xml should contain bittasker.com').toContain('bittasker.com');
	});
});

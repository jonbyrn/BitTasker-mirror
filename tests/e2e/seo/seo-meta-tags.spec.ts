import { test, expect } from '@playwright/test';
import http from 'node:http';

const BASE_URL = process.env.PW_E2E_BASE_URL || 'http://localhost:3000';

function fetchHTML(url: string): Promise<string> {
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

const seoPages = ['/', '/about', '/faq', '/terms', '/how-it-works', '/privacy', '/security'];

test.describe('SEO meta tags on prerendered pages', () => {
	for (const route of seoPages) {
		test(`${route} has required SEO meta tags`, async () => {
			const html = await fetchHTML(`${BASE_URL}${route}`);

			const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*>/i);
			expect(ogTitleMatch, `og:title meta tag should exist on ${route}`).not.toBeNull();

			const descriptionMatch = html.match(
				/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i
			) || html.match(
				/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i
			);
			expect(descriptionMatch, `meta description should exist on ${route}`).not.toBeNull();
			expect(
				descriptionMatch![1].length,
				`meta description content length should be > 10 on ${route}`
			).toBeGreaterThan(10);

			const canonicalMatch = html.match(
				/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i
			);
			expect(canonicalMatch, `canonical link should exist on ${route}`).not.toBeNull();
			expect(
				canonicalMatch![1],
				`canonical should contain bittasker.com on ${route}`
			).toContain('bittasker.com');

			const robotsMatch = html.match(
				/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["'][^>]*>/i
			);
			expect(robotsMatch, `meta robots should exist on ${route}`).not.toBeNull();
			expect(
				robotsMatch![1],
				`meta robots should contain "index" on ${route}`
			).toContain('index');
		});
	}

	test('homepage has JSON-LD structured data scripts', async () => {
		const html = await fetchHTML(`${BASE_URL}/`);

		const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/gi);
		expect(
			jsonLdMatches,
			'Homepage should have at least 2 JSON-LD scripts'
		).not.toBeNull();
		expect(jsonLdMatches!.length).toBeGreaterThanOrEqual(2);
	});
});

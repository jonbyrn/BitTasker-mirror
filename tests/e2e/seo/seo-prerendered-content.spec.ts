import { test, expect } from '@playwright/test';
import http from 'node:http';

const BASE_URL = process.env.PW_E2E_BASE_URL || 'http://localhost:3000';

function fetchHTML(url: string): Promise<string> {
	return new Promise((resolve, reject) => {
		http
			.get(url, (res) => {
				let data = '';
				res.on('data', (chunk) => {
					data += chunk;
				});
				res.on('end', () => resolve(data));
				res.on('error', reject);
			})
			.on('error', reject);
	});
}

test.describe('SEO prerendered content', () => {
	test('homepage contains real translated English content, not i18n keys', async () => {
		const html = await fetchHTML(`${BASE_URL}/`);

		expect(html, 'Homepage should not contain raw i18n keys like "homepage.v2."').not.toContain(
			'homepage.v2.'
		);

		expect(html, 'Homepage should contain the plain headline').toContain(
			'Find work. Find help. Get things done.'
		);

		expect(html, 'Homepage should contain the get started button').toContain(
			"Get Started"
		);
	});

	const companyPages = ['/about', '/faq', '/terms'];

	for (const route of companyPages) {
		test(`${route} has a unique and non-empty title`, async () => {
			const html = await fetchHTML(`${BASE_URL}${route}`);

			const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
			expect(titleMatch, `<title> tag should exist on ${route}`).not.toBeNull();
			expect(
				titleMatch![1].trim().length,
				`<title> should not be empty on ${route}`
			).toBeGreaterThan(0);

			expect(
				titleMatch![1].trim().toLowerCase(),
				`<title> should not be a generic placeholder on ${route}`
			).not.toBe('sveltekit');
		});

		test(`${route} has og:title meta tag`, async () => {
			const html = await fetchHTML(`${BASE_URL}${route}`);

			const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*>/i);
			expect(ogTitleMatch, `og:title should exist on ${route}`).not.toBeNull();
		});
	}
});

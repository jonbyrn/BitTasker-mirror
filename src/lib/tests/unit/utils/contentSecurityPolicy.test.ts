import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTENT_SECURITY_POLICY } from '$lib/utils/security/contentSecurityPolicy';

describe('signup content security policy', () => {
	it('allows connect-src data and the Turnstile challenge host', () => {
		expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self' data:");
		expect(CONTENT_SECURITY_POLICY).toContain('https://challenges.cloudflare.com');
		expect(CONTENT_SECURITY_POLICY).toContain('wss:');

		const headers = readFileSync('static/_headers', 'utf8');
		const html = readFileSync('src/app.html', 'utf8');
		expect(headers).toContain(`Content-Security-Policy: ${CONTENT_SECURITY_POLICY}`);
		expect(html).toContain(`content="${CONTENT_SECURITY_POLICY}"`);
	});

	it('keeps the Meilisearch search key as an inherited production secret', () => {
		const wrangler = readFileSync('wrangler.toml', 'utf8');
		expect(wrangler).toContain('[env.production.secrets]');
		expect(wrangler).toContain('required = ["MEILI_SEARCH_KEY"]');
		expect(wrangler).not.toMatch(/MEILI_SEARCH_KEY\s*=\s*"/);
	});
});

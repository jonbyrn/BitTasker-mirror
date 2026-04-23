import { test, expect } from '@playwright/test';

const NSEC_KEY = 'nsec1ljqmrqvkjjgd46yzd66nzpzgznghyfpcvs4nxk6j5jg2mxvs7r8qjyefh3';

test.describe.configure({ mode: 'serial' });

test('NSEC login hits API host and logs request url', async ({ page }) => {
	const challengeRequests: string[] = [];

	page.on('request', (request) => {
		if (request.url().includes('/api/v1/auth/challenge')) {
			challengeRequests.push(request.url());
		}
	});

	await page.goto('/auth/login');
	await page.click('[data-testid="login-with-nsec"]');
	await page.fill('[data-testid="login-nsec-input"]', NSEC_KEY);
	await page.click('[data-testid="login-submit"]');

	await page.waitForTimeout(4000);

	expect(challengeRequests.length).toBeGreaterThan(0);
	expect(challengeRequests.every((url) => !url.startsWith('http://127.0.0.1'))).toBeTruthy();
});

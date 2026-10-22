import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { captchaRequiredForHost } from '$lib/stores/auth-captcha';

describe('signup captcha hosts', () => {
	it('requires the widget except on rgb.bittasker.com and workers.dev previews', () => {
		expect(captchaRequiredForHost('bittasker.com')).toBe(true);
		expect(captchaRequiredForHost('www.bittasker.com')).toBe(true);
		expect(captchaRequiredForHost('app.bittasker.com')).toBe(true);
		expect(captchaRequiredForHost('localhost')).toBe(true);
		expect(captchaRequiredForHost('127.0.0.1')).toBe(true);
		expect(captchaRequiredForHost('rgb.bittasker.com')).toBe(false);
		expect(
			captchaRequiredForHost('cursor-smoke1800-browse-fix-bittasker-sandbox.scott-0e4.workers.dev')
		).toBe(false);
	});

	it('does not treat a preview host as already verified for a direct onboarding visit', () => {
		const layout = readFileSync('src/routes/(app)/auth/+layout.ts', 'utf8');
		const signup = readFileSync('src/routes/(app)/auth/signup/+page.svelte', 'utf8');
		expect(layout).not.toContain('isPreviewTurnstileHost');
		expect(layout).toContain("redirect(303, '/auth/signup')");
		expect(signup).toContain('skipPreviewTurnstile');
		expect(signup).toContain("goto(resolve('/auth/onboarding'))");
	});
});

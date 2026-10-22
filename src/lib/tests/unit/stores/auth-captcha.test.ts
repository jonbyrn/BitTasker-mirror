import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { captchaRequiredForHost, shouldMountSignupTurnstile } from '$lib/stores/auth-captcha';

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

	it('does not mount the widget until a hostname is known, and never on preview hosts', () => {
		expect(shouldMountSignupTurnstile(undefined)).toBe(false);
		expect(shouldMountSignupTurnstile(null)).toBe(false);
		expect(shouldMountSignupTurnstile('')).toBe(false);
		expect(shouldMountSignupTurnstile('   ')).toBe(false);
		expect(shouldMountSignupTurnstile('rgb.bittasker.com')).toBe(false);
		expect(shouldMountSignupTurnstile('RGB.BitTasker.com')).toBe(false);
		expect(
			shouldMountSignupTurnstile(
				'cursor-smoke1800-browse-fix-bittasker-sandbox.scott-0e4.workers.dev'
			)
		).toBe(false);
		expect(shouldMountSignupTurnstile('bittasker.com')).toBe(true);
		expect(shouldMountSignupTurnstile('www.bittasker.com')).toBe(true);
		expect(shouldMountSignupTurnstile('localhost')).toBe(true);
	});

	it('does not treat a preview host as already verified for a direct onboarding visit', () => {
		const layout = readFileSync('src/routes/(app)/auth/+layout.ts', 'utf8');
		const signup = readFileSync('src/routes/(app)/auth/signup/+page.svelte', 'utf8');
		expect(layout).not.toContain('isPreviewTurnstileHost');
		expect(layout).toContain("redirect(303, '/auth/signup')");
		expect(signup).not.toContain('skipPreviewTurnstile');
		expect(signup).not.toContain('<svelte:head>');
		expect(signup).toContain('shouldMountSignupTurnstile');
		expect(signup).toContain('mountTurnstile = $state(false)');
		const guard = signup.indexOf('if (!shouldMountSignupTurnstile(window.location.hostname))');
		const script = signup.indexOf('challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
		expect(guard).toBeGreaterThan(-1);
		expect(script).toBeGreaterThan(guard);
		expect(signup).toContain("goto(resolve('/auth/onboarding'))");
	});
});

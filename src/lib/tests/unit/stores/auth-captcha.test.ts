import { describe, expect, it } from 'vitest';
import { captchaRequiredForHost } from '$lib/stores/auth-captcha';

describe('signup captcha hosts', () => {
	it('requires the widget on production and skips preview and rgb hosts', () => {
		expect(captchaRequiredForHost('bittasker.com')).toBe(true);
		expect(captchaRequiredForHost('www.bittasker.com')).toBe(true);
		expect(captchaRequiredForHost('app.bittasker.com')).toBe(true);
		expect(captchaRequiredForHost('rgb.bittasker.com')).toBe(false);
		expect(
			captchaRequiredForHost('cursor-smoke1800-browse-fix-bittasker-sandbox.scott-0e4.workers.dev')
		).toBe(false);
		expect(captchaRequiredForHost('localhost')).toBe(false);
		expect(captchaRequiredForHost('127.0.0.1')).toBe(false);
	});
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('passkey setup copy', () => {
	it('has English and Spanish text for a timed-out or pending passkey', () => {
		const en = JSON.parse(readFileSync('static/locales/en/auth.json', 'utf8')) as {
			onboarding_auth: {
				form: { passkey_setup: { errors: Record<string, string>; retry: string } };
			};
		};
		const es = JSON.parse(readFileSync('static/locales/es/auth.json', 'utf8')) as {
			onboarding_auth: {
				form: { passkey_setup: { errors: Record<string, string>; retry: string } };
			};
		};

		for (const key of ['timed_out', 'pending'] as const) {
			const english = en.onboarding_auth.form.passkey_setup.errors[key];
			const spanish = es.onboarding_auth.form.passkey_setup.errors[key];
			expect(english.length).toBeGreaterThan(20);
			expect(spanish.length).toBeGreaterThan(20);
			expect(spanish).not.toBe(english);
			expect(english).not.toMatch(/^onboarding_auth\./);
			expect(spanish).not.toMatch(/^onboarding_auth\./);
		}

		expect(en.onboarding_auth.form.passkey_setup.retry).toBe('Retry');
		expect(es.onboarding_auth.form.passkey_setup.retry).toBe('Reintentar');
	});
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LOCALES = ['en', 'es', 'fr', 'pt', 'sw'] as const;
const KEYS = [
	'button',
	'title',
	'empty',
	'sent',
	'received',
	'back',
	'close',
	'explorer',
	'price_unavailable',
	'pull',
	'sats',
	'pending',
	'confirmed',
	'failed'
] as const;

describe('wallet transaction copy', () => {
	it.each(LOCALES)('%s has the transactions strings', (locale) => {
		const file = JSON.parse(
			readFileSync(`static/locales/${locale}/dashboard/wallet.json`, 'utf8')
		) as { wallet?: { transactions?: Record<string, string> } };
		const copy = file.wallet?.transactions;
		expect(copy).toBeTruthy();
		for (const key of KEYS) {
			const value = copy?.[key] ?? '';
			expect(value.length).toBeGreaterThan(0);
			expect(value).not.toMatch(/^wallet\./);
		}
	});
});

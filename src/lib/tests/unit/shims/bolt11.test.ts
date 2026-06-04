import { describe, it, expect } from 'vitest';
import { decode } from '$lib/shims/bolt11';

const SAMPLE_INVOICE =
	'lnbc20u1p3y0x3hpp5743k2g0fsqqxj7n8qzuhns5gmkk4djeejk3wkp64ppevgekvc0jsdqcve5kzar2v9nr5gpqd4hkuetesp5ez2g297jduwc20t6lmqlsg3man0vf2jfd8ar9fh8fhn2g8yttfkqxqy9gcqcqzys9qrsgqrzjqtx3k77yrrav9hye7zar2rtqlfkytl094dsp0ms5majzth6gt7ca6uhdkxl983uywgqqqqlgqqqvx5qqjqrzjqd98kxkpyw0l9tyy8r8q57k7zpy9zjmh6sez752wj6gcumqnj3yxzhdsmg6qq56utgqqqqqqqqqqqeqqjq7jd56882gtxhrjm03c93aacyfy306m4fq0tskf83c0nmet8zc2lxyyg3saz8x6vwcp26xnrlagf9semau3qm2glysp7sv95693fphvsp54l567';

describe('bolt11 shim', () => {
	it('decodes amount and description like the legacy bolt11 package', () => {
		const decoded = decode(SAMPLE_INVOICE);
		expect(decoded.satoshis).toBe(2000);
		expect(decoded.millisatoshis).toBe('2000000');
		expect(decoded.tags.find((tag) => tag.tagName === 'description')?.data).toBe('fiatjaf:  money');
	});

	it('exposes payment_hash for wallet-core submarine swaps', () => {
		const decoded = decode(SAMPLE_INVOICE);
		const paymentHash = decoded.tags.find((tag) => tag.tagName === 'payment_hash');
		expect(paymentHash?.data).toBe(
			'f5636521e98000697a6700b979c288ddad56cb3995a2eb07550872c466ccc3e5'
		);
	});

	it('throws on invalid invoices', () => {
		expect(() => decode('lnbcnotavalidinvoice')).toThrow();
	});
});

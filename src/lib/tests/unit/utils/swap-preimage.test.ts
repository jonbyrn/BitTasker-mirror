import { describe, it, expect } from 'vitest';
import { generateSwapPreimage } from '$lib/utils/swap-preimage';

describe('generateSwapPreimage', () => {
	it('returns 64-char hex preimage and 64-char hex hash', async () => {
		const { preimageHex, hashHex } = await generateSwapPreimage();
		expect(preimageHex).toMatch(/^[0-9a-f]{64}$/);
		expect(hashHex).toMatch(/^[0-9a-f]{64}$/);
	});

	it('produces unique results per call', async () => {
		const a = await generateSwapPreimage();
		const b = await generateSwapPreimage();
		expect(a.preimageHex).not.toBe(b.preimageHex);
		expect(a.hashHex).not.toBe(b.hashHex);
	});

	it('hash is SHA-256 of preimage', async () => {
		const { preimageHex, hashHex } = await generateSwapPreimage();
		const preimageBytes = new Uint8Array(preimageHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
		const expectedHash = Array.from(
			new Uint8Array(await crypto.subtle.digest('SHA-256', preimageBytes))
		)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
		expect(hashHex).toBe(expectedHash);
	});

	it('preimage is exactly 32 bytes (64 hex chars)', async () => {
		const { preimageHex } = await generateSwapPreimage();
		expect(preimageHex.length).toBe(64);
	});

	it('hash is exactly 32 bytes (64 hex chars)', async () => {
		const { hashHex } = await generateSwapPreimage();
		expect(hashHex.length).toBe(64);
	});

	it('preimage contains only lowercase hex characters', async () => {
		const { preimageHex } = await generateSwapPreimage();
		expect(preimageHex).toMatch(/^[0-9a-f]+$/);
	});

	it('hash contains only lowercase hex characters', async () => {
		const { hashHex } = await generateSwapPreimage();
		expect(hashHex).toMatch(/^[0-9a-f]+$/);
	});
});

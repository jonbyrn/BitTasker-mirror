import { describe, it, expect, vi } from 'vitest';
import { getNpubBech32DataPart, resolveHandle } from '$lib/utils/helpers/handleResolver';

describe('getNpubBech32DataPart', () => {
	it('returns data part (between npub1 and checksum) for valid hex pubkey', () => {
		// 32-byte hex = 64 chars
		const hex = '7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c334167357e2467c32bf9501c';
		const part = getNpubBech32DataPart(hex);
		expect(part.length).toBeGreaterThan(0);
		expect(part).not.toContain('npub');
	});

	it('returns empty string for invalid hex', () => {
		expect(getNpubBech32DataPart('')).toBe('');
		expect(getNpubBech32DataPart('zz')).toBe('');
	});
});

describe('resolveHandle', () => {
	it('returns handle with base from display name and suffix when available', async () => {
		const check = vi.fn().mockResolvedValue(true);
		const handle = await resolveHandle(
			'Jane Doe',
			'7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c334167357e2467c32bf9501c',
			check
		);
		expect(handle).toMatch(/^jane_doe_[a-z0-9]+$/);
		expect(check).toHaveBeenCalledWith(handle);
	});

	it('uses fallback base when display name normalizes to empty', async () => {
		const check = vi.fn().mockResolvedValue(true);
		const handle = await resolveHandle(
			'@@',
			'7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c334167357e2467c32bf9501c',
			check
		);
		expect(handle).toMatch(/^tasker_[a-z0-9]+_[a-z0-9]+$/);
	});

	it('tries longer suffix when first handle is taken', async () => {
		const check = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		const handle = await resolveHandle(
			'jane',
			'7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c334167357e2467c32bf9501c',
			check
		);
		expect(handle).toMatch(/^jane_[a-z0-9]+$/);
		expect(check).toHaveBeenCalledTimes(2);
	});
});

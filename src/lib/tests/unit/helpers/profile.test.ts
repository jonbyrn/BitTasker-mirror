import { describe, it, expect } from 'vitest';
import { getProfileUrl } from '$lib/utils/helpers/profile';

describe('profile', () => {
	describe('getProfileUrl', () => {
		it('should return /npub/{npub} for valid npub', () => {
			expect(getProfileUrl('npub123abc')).toBe('/npub/npub123abc');
		});

		it('should return /taskees for empty or falsy npub', () => {
			expect(getProfileUrl('')).toBe('/taskees');
			expect(getProfileUrl(undefined as unknown as string)).toBe('/taskees');
		});
	});
});

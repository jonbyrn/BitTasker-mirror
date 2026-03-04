import { describe, it, expect } from 'vitest';
import { getRatingColor, getStarClassForIndex, getStarClassForIndexMuted } from '../review-display';

describe('review-display', () => {
	describe('getRatingColor', () => {
		it('returns neutral when rating is 0', () => {
			expect(getRatingColor(0)).toContain('base-content');
		});
		it('returns primary for positive rating with reviews', () => {
			expect(getRatingColor(4, 1)).toContain('primary');
		});
	});
	describe('getStarClassForIndex', () => {
		it('returns filled when currentRating >= starIndex', () => {
			expect(getStarClassForIndex(1, 1)).toContain('primary');
		});
		it('returns unfilled when currentRating < starIndex', () => {
			expect(getStarClassForIndex(3, 2)).toContain('base-content');
		});
	});
	describe('getStarClassForIndexMuted', () => {
		it('returns muted unfilled for index above rating', () => {
			expect(getStarClassForIndexMuted(4, 3)).toContain('base-content');
		});
	});
});

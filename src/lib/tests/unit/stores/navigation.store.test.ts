import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/state', () => ({
	page: { url: { pathname: '/dashboard' } }
}));

import { showBackButton } from '$lib/stores/navigation.store';

describe('navigation.store (showBackButton)', () => {
	beforeEach(() => {
		showBackButton.resetBackButton();
	});

	describe('setBackButton', () => {
		it('should show back button when set to "show"', () => {
			showBackButton.setBackButton('show');
			expect(get(showBackButton)).toBe(true);
		});

		it('should hide back button when set to "hide"', () => {
			showBackButton.setBackButton('hide');
			expect(get(showBackButton)).toBe(false);
		});

		it('should use auto (path-based) when set to "auto"', () => {
			showBackButton.setBackButton('show');
			showBackButton.setBackButton('auto');
			// With mocked path /dashboard (primary route), auto yields false
			expect(get(showBackButton)).toBe(false);
		});
	});

	describe('resetBackButton', () => {
		it('should restore auto behavior', () => {
			showBackButton.setBackButton('show');
			expect(get(showBackButton)).toBe(true);
			showBackButton.resetBackButton();
			expect(get(showBackButton)).toBe(false);
		});
	});
});

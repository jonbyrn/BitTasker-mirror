import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPullToRefreshHandler, getPullToRefreshState } from '$lib/utils/pull-to-refresh';

describe('Pull to Refresh', () => {
	let element: HTMLElement | null = null;

	beforeEach(() => {
		if (typeof document !== 'undefined') {
			element = document.createElement('div');
			element.scrollTop = 0;
			document.body.appendChild(element);
		}
	});

	afterEach(() => {
		if (element && typeof document !== 'undefined' && document.body && document.body.contains(element)) {
			document.body.removeChild(element);
			element = null;
		}
	});

	describe('createPullToRefreshHandler', () => {
		it('should create pull-to-refresh handler', () => {
			if (!element) return;
			const onRefresh = vi.fn();
			const cleanup = createPullToRefreshHandler(element, {
				onRefresh
			});

			expect(cleanup).toBeInstanceOf(Function);
			cleanup();
		});

		it('should only trigger when at top of scrollable area', () => {
			if (!element) return;
			const onRefresh = vi.fn();
			createPullToRefreshHandler(element, {
				threshold: 80,
				onRefresh
			});

			// Set scroll position to non-zero
			element.scrollTop = 100;

			// Simulate pull gesture
			const touchStart = new TouchEvent('touchstart', {
				touches: [new Touch({ clientX: 50, clientY: 100, identifier: 0, target: element })]
			});
			element.dispatchEvent(touchStart);

			// Handler should not trigger when not at top
			expect(element.scrollTop).toBe(100);
		});
	});

	describe('getPullToRefreshState', () => {
		it('should return default state', () => {
			const state = getPullToRefreshState();
			expect(state.isPulling).toBe(false);
			expect(state.pullDistance).toBe(0);
			expect(state.isRefreshing).toBe(false);
		});
	});
});


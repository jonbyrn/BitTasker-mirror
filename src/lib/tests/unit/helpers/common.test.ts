import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '$lib/utils/helpers/common';

describe('common', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('debounce', () => {
		it('should call the function after delay when invoked once', () => {
			const fn = vi.fn();
			const debounced = debounce(fn, 100) as (...args: unknown[]) => void;
			debounced('a');
			expect(fn).not.toHaveBeenCalled();
			vi.advanceTimersByTime(100);
			expect(fn).toHaveBeenCalledTimes(1);
			expect(fn).toHaveBeenCalledWith('a');
		});

		it('should reset timer on repeated calls within delay', () => {
			const fn = vi.fn();
			const debounced = debounce(fn, 100) as (...args: unknown[]) => void;
			debounced('a');
			vi.advanceTimersByTime(50);
			debounced('b');
			vi.advanceTimersByTime(50);
			expect(fn).not.toHaveBeenCalled();
			vi.advanceTimersByTime(50);
			expect(fn).toHaveBeenCalledTimes(1);
			expect(fn).toHaveBeenCalledWith('b');
		});

		it('should pass multiple arguments to the debounced function', () => {
			const fn = vi.fn();
			const debounced = debounce(fn, 100) as (...args: unknown[]) => void;
			debounced(1, 2, 3);
			vi.advanceTimersByTime(100);
			expect(fn).toHaveBeenCalledWith(1, 2, 3);
		});
	});
});

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '$lib/utils/helpers/common';

describe('debounce', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('delays function execution', () => {
		const fn = vi.fn();
		const debouncedFn = debounce(fn, 100);

		debouncedFn();
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('cancels previous calls on repeated invocations', () => {
		const fn = vi.fn();
		const debouncedFn = debounce(fn, 100);

		debouncedFn();
		vi.advanceTimersByTime(50);
		debouncedFn();
		vi.advanceTimersByTime(50);
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('passes parameters correctly', () => {
		const fn = vi.fn();
		const debouncedFn = debounce(fn, 100);

		debouncedFn('arg1', 2, { key: 'value' });
		vi.advanceTimersByTime(100);

		expect(fn).toHaveBeenCalledWith('arg1', 2, { key: 'value' });
	});

	it('executes with correct this context', () => {
		const obj = {
			value: 0,
			add: debounce(function (this: { value: number }, num: number) {
				this.value += num;
			} as (...args: unknown[]) => void, 100)
		};

		obj.add(5);
		vi.advanceTimersByTime(100);

		expect(obj.value).toBe(5);
		expect(() => obj.add(5)).not.toThrow();
	});

	it('executes only once when called multiple times within delay', () => {
		const fn = vi.fn();
		const debouncedFn = debounce(fn, 100);

		debouncedFn();
		debouncedFn();
		debouncedFn();
		vi.advanceTimersByTime(100);

		expect(fn).toHaveBeenCalledTimes(1);
	});
});
// Debounce function with abort signal support
export function debounce<T extends (...args: unknown[]) => void>(fn: T, delay: number) {
	let timeoutId: ReturnType<typeof setTimeout>;
	return function (this: void, ...args: Parameters<T>) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn.apply(this, args), delay);
	};
}

// Debounce with AbortController support for cancellation
export function debounceWithAbort<T extends (...args: unknown[]) => void>(
	fn: T,
	delay: number
): T & { abort(): void } {
	let timeoutId: ReturnType<typeof setTimeout>;
	const abortController = new AbortController();

	const debouncedFn = function (this: Record<string, unknown>, ...args: Parameters<T>) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			if (!abortController.signal.aborted) {
				fn.apply(this, args);
			}
		}, delay);
	} as T & { abort(): void };

	debouncedFn.abort = () => {
		clearTimeout(timeoutId);
		abortController.abort();
	};

	return debouncedFn;
}

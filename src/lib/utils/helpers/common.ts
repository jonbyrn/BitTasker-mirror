// Debounce function with abort signal support
export function debounce<Args extends unknown[]>(
	fn: (...args: Args) => void,
	delay: number
): (...args: Args) => void {
	let timeoutId: ReturnType<typeof setTimeout>;
	return function (this: void, ...args: Args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	};
}

// Debounce with AbortController support for cancellation
export function debounceWithAbort<Args extends unknown[]>(
	fn: (...args: Args) => void,
	delay: number
): ((...args: Args) => void) & { abort(): void } {
	let timeoutId: ReturnType<typeof setTimeout>;
	const abortController = new AbortController();

	const debouncedFn = function (this: void, ...args: Args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			if (!abortController.signal.aborted) {
				fn(...args);
			}
		}, delay);
	} as ((...args: Args) => void) & { abort(): void };

	debouncedFn.abort = () => {
		clearTimeout(timeoutId);
		abortController.abort();
	};

	return debouncedFn;
}

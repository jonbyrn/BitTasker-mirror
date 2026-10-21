/** Reject when a promise does not settle in time. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('timeout')), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

/** Always settles, so a hung request cannot keep a spinner up. */
export function settleWithin<T>(promise: Promise<T>, ms: number): Promise<PromiseSettledResult<T>> {
	return withTimeout(promise, ms).then(
		(value) => ({ status: 'fulfilled', value }),
		(reason) => ({ status: 'rejected', reason })
	);
}

export function isTimeout(reason: unknown): boolean {
	return reason instanceof Error && reason.message === 'timeout';
}

import { describe, expect, it } from 'vitest';
import { withTimeout } from '$lib/nostr/findServices';

describe('withTimeout', () => {
	it('returns resolved value when promise resolves before timeout', async () => {
		const value = { data: 'success' };
		const promise = Promise.resolve(value);

		const result = withTimeout(promise, 1000);

		await expect(result).resolves.toEqual(value);
	});

	it('throws error when promise rejects before timeout', async () => {
		const error = new Error('Promise rejected');
		const promise = Promise.reject(error);

		const result = withTimeout(promise, 1000);

		await expect(result).rejects.toThrow('Promise rejected');
	});

	it('rejects with timeout error when promise takes longer than timeout', async () => {
		const promise = new Promise<string>((resolve) => {
			setTimeout(() => resolve('late'), 100);
		});

		const result = withTimeout(promise, 50);

		await expect(result).rejects.toThrow('Request timeout');
	});

	it('rejects immediately when timeout is 0', async () => {
		const promise = new Promise<string>((resolve) => {
			setTimeout(() => resolve('never'), 100);
		});

		const result = withTimeout(promise, 0);

		await expect(result).rejects.toThrow('Request timeout');
	});

	it('completes normally when timeout is very large', async () => {
		const value = { data: 'success' };
		const promise = new Promise<typeof value>((resolve) => {
			setTimeout(() => resolve(value), 50);
		});

		const result = withTimeout(promise, 10000);

		await expect(result).resolves.toEqual(value);
	});
});

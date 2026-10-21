import { describe, expect, it } from 'vitest';
import { isTimeout, settleWithin, withTimeout } from '$lib/utils/with-timeout';

describe('withTimeout', () => {
	it('returns the value when the promise settles in time', async () => {
		await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
	});

	it('rejects when the promise never settles', async () => {
		await expect(withTimeout(new Promise(() => undefined), 20)).rejects.toThrow('timeout');
	});

	it('settles a hung request as a timeout result', async () => {
		const result = await settleWithin(new Promise(() => undefined), 20);
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(isTimeout(result.reason)).toBe(true);
	});
});

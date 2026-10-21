import { isHttpError } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { load } from '../../../../routes/[...path]/+page';

describe('unknown routes', () => {
	it('answers with 404 instead of a server error', () => {
		expect.assertions(2);
		try {
			load();
		} catch (error) {
			expect(isHttpError(error)).toBe(true);
			if (isHttpError(error)) expect(error.status).toBe(404);
		}
	});
});

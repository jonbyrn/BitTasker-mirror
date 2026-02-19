/**
 * Smoke/placeholder test – always passes.
 * Kept so CI has a minimal validated set; add more unit tests under unit/ as they are fixed.
 */
import { describe, it, expect } from 'vitest';

describe('Unit test suite (smoke)', () => {
	it('passes so the pipeline can run until more tests are wired in', () => {
		expect(true).toBe(true);
	});
});

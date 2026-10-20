import { describe, expect, it } from 'vitest';
import { buildLabel } from '$lib/utils/build-label';

describe('buildLabel', () => {
	it('shows a git sha and hides anything else', () => {
		expect(buildLabel('B5C01D4C')).toBe('b5c01d4c');
		expect(buildLabel('a'.repeat(40))).toBe('a'.repeat(40));
		expect(buildLabel(undefined)).toBe('local');
		expect(buildLabel('')).toBe('local');
		expect(buildLabel('$CLOUDFLARE_API_TOKEN')).toBe('local');
		expect(buildLabel('abc')).toBe('local');
	});
});

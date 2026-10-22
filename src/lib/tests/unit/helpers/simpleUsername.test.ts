import { describe, expect, it } from 'vitest';
import {
	normalizeSimpleUsername,
	simpleUsernameIssue,
	suggestUsername
} from '$lib/utils/helpers/simpleUsername';

describe('simpleUsername', () => {
	it('accepts a short handle', () => {
		expect(simpleUsernameIssue('Ada_Lovelace')).toBeNull();
		expect(normalizeSimpleUsername('Ada_Lovelace')).toBe('ada_lovelace');
	});

	it('rejects blank, short, long, and symbolic names', () => {
		expect(simpleUsernameIssue('  ')).toBe('required');
		expect(simpleUsernameIssue('ab')).toBe('too_short');
		expect(simpleUsernameIssue('a'.repeat(21))).toBe('too_long');
		expect(simpleUsernameIssue('user-name')).toBe('invalid_characters');
		expect(simpleUsernameIssue('1ada')).toBe('invalid_characters');
		expect(simpleUsernameIssue('ada lovelace')).toBe('invalid_characters');
		expect(simpleUsernameIssue('ada\tlovelace')).toBe('invalid_characters');
	});

	it('suggests a handle from a display name', () => {
		expect(suggestUsername('Ada Lovelace')).toBe('ada_lovelace');
		expect(suggestUsername('李')).toBe('');
		expect(suggestUsername('A')).toBe('');
	});
});

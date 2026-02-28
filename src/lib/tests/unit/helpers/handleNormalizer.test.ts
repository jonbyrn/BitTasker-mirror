import { describe, it, expect } from 'vitest';
import {
	normalizeDisplayNameToHandleBase,
	normalizeDisplayNameToNip05HandleBase
} from '$lib/utils/helpers/handleNormalizer';

describe('normalizeDisplayNameToHandleBase', () => {
	describe('trim and lowercase', () => {
		it('trims leading and trailing whitespace', () => {
			expect(normalizeDisplayNameToHandleBase('  jane  ')).toBe('jane');
			expect(normalizeDisplayNameToHandleBase('\tAlice\t')).toBe('alice');
		});

		it('converts to lowercase', () => {
			expect(normalizeDisplayNameToHandleBase('Jane')).toBe('jane');
			expect(normalizeDisplayNameToHandleBase('BOB')).toBe('bob');
		});
	});

	describe('spaces to underscore', () => {
		it('replaces spaces with single underscore', () => {
			expect(normalizeDisplayNameToHandleBase('jane doe')).toBe('jane_doe');
			expect(normalizeDisplayNameToHandleBase('mary jane watson')).toBe('mary_jane_watson');
		});

		it('collapses multiple spaces to single underscore', () => {
			expect(normalizeDisplayNameToHandleBase('jane   doe')).toBe('jane_doe');
			expect(normalizeDisplayNameToHandleBase('a    b')).toBe('a_b');
		});
	});

	describe('allowed characters (Unicode letters, numbers, ._-)', () => {
		it('keeps ASCII letters and numbers', () => {
			expect(normalizeDisplayNameToHandleBase('jane123')).toBe('jane123');
			expect(normalizeDisplayNameToHandleBase('user42')).toBe('user42');
		});

		it('keeps dots, underscores, and hyphens', () => {
			expect(normalizeDisplayNameToHandleBase('jane.doe')).toBe('jane.doe');
			expect(normalizeDisplayNameToHandleBase('jane_doe')).toBe('jane_doe');
			expect(normalizeDisplayNameToHandleBase('jane-doe')).toBe('jane-doe');
		});

		it('keeps Unicode letters (accents and other scripts)', () => {
			expect(normalizeDisplayNameToHandleBase('café')).toBe('café');
			expect(normalizeDisplayNameToHandleBase('naïve')).toBe('naïve');
			expect(normalizeDisplayNameToHandleBase('Müller')).toBe('müller');
			expect(normalizeDisplayNameToHandleBase('José')).toBe('josé');
			expect(normalizeDisplayNameToHandleBase('北京')).toBe('北京');
			expect(normalizeDisplayNameToHandleBase('東京')).toBe('東京');
		});

		it('strips characters that are not letters, numbers, or ._-', () => {
			expect(normalizeDisplayNameToHandleBase('jane@doe')).toBe('janedoe');
			expect(normalizeDisplayNameToHandleBase('jane!doe')).toBe('janedoe');
			expect(normalizeDisplayNameToHandleBase('jane#doe')).toBe('janedoe');
			expect(normalizeDisplayNameToHandleBase('jane$doe')).toBe('janedoe');
			expect(normalizeDisplayNameToHandleBase('jane (doe)')).toBe('jane_doe');
		});
	});

	describe('collapse repeated separators', () => {
		it('collapses repeated underscores', () => {
			expect(normalizeDisplayNameToHandleBase('jane___doe')).toBe('jane_doe');
		});

		it('collapses repeated dots', () => {
			expect(normalizeDisplayNameToHandleBase('jane..doe')).toBe('jane.doe');
			expect(normalizeDisplayNameToHandleBase('a...b')).toBe('a.b');
		});

		it('collapses repeated hyphens', () => {
			expect(normalizeDisplayNameToHandleBase('jane---doe')).toBe('jane-doe');
		});
	});

	describe('email-style trim (no leading/trailing . or -)', () => {
		it('removes leading and trailing dots', () => {
			expect(normalizeDisplayNameToHandleBase('.jane.')).toBe('jane');
			expect(normalizeDisplayNameToHandleBase('..jane..')).toBe('jane');
		});

		it('removes leading and trailing hyphens', () => {
			expect(normalizeDisplayNameToHandleBase('-jane-')).toBe('jane');
			expect(normalizeDisplayNameToHandleBase('--jane--')).toBe('jane');
		});

		it('removes leading and trailing mix of . and -', () => {
			expect(normalizeDisplayNameToHandleBase('.-jane-.')).toBe('jane');
		});
	});

	describe('max length', () => {
		it('truncates to maxLength when provided', () => {
			expect(normalizeDisplayNameToHandleBase('abcdefghij', 5)).toBe('abcde');
			expect(normalizeDisplayNameToHandleBase('a b c d e f', 5)).toBe('a_b_c');
		});

		it('returns full string when under maxLength', () => {
			expect(normalizeDisplayNameToHandleBase('jane', 10)).toBe('jane');
		});

		it('works without maxLength (no truncation)', () => {
			const long = 'a'.repeat(100);
			expect(normalizeDisplayNameToHandleBase(long)).toBe(long);
		});
	});

	describe('empty result', () => {
		it('returns empty string for empty input', () => {
			expect(normalizeDisplayNameToHandleBase('')).toBe('');
			expect(normalizeDisplayNameToHandleBase('   ')).toBe('');
		});

		it('returns empty string when all characters are stripped', () => {
			expect(normalizeDisplayNameToHandleBase('@@##!!')).toBe('');
			expect(normalizeDisplayNameToHandleBase('...')).toBe('');
			expect(normalizeDisplayNameToHandleBase('---')).toBe('');
			expect(normalizeDisplayNameToHandleBase('._.-.')).toBe('');
		});

		it('returns empty string for only symbols and spaces', () => {
			expect(normalizeDisplayNameToHandleBase(' @ # $ % ')).toBe('');
		});
	});

	describe('integration (real-world display names)', () => {
		it('normalizes "Jane Doe" to jane_doe', () => {
			expect(normalizeDisplayNameToHandleBase('Jane Doe')).toBe('jane_doe');
		});

		it('normalizes "Mary Jane Watson" to mary_jane_watson', () => {
			expect(normalizeDisplayNameToHandleBase('Mary Jane Watson')).toBe('mary_jane_watson');
		});

		it('normalizes "O\'Brien" stripping apostrophe', () => {
			expect(normalizeDisplayNameToHandleBase("O'Brien")).toBe('obrien');
		});

		it('normalizes "José García" with Unicode', () => {
			expect(normalizeDisplayNameToHandleBase('José García')).toBe('josé_garcía');
		});

		it('normalizes "user.name" keeping dot', () => {
			expect(normalizeDisplayNameToHandleBase('user.name')).toBe('user.name');
		});

		it('normalizes "  extra   spaces  " to extra_spaces', () => {
			expect(normalizeDisplayNameToHandleBase('  extra   spaces  ')).toBe('extra_spaces');
		});
	});
});

describe('normalizeDisplayNameToNip05HandleBase', () => {
	it('allows only a-z 0-9 - _ . (strips Unicode and other chars)', () => {
		expect(normalizeDisplayNameToNip05HandleBase('café')).toBe('caf');
		expect(normalizeDisplayNameToNip05HandleBase('José')).toBe('jos');
		expect(normalizeDisplayNameToNip05HandleBase('jane@doe')).toBe('janedoe');
		expect(normalizeDisplayNameToNip05HandleBase('jane.doe')).toBe('jane.doe');
		expect(normalizeDisplayNameToNip05HandleBase('jane_doe')).toBe('jane_doe');
		expect(normalizeDisplayNameToNip05HandleBase('jane-doe')).toBe('jane-doe');
	});

	it('lowercases and replaces spaces with underscore', () => {
		expect(normalizeDisplayNameToNip05HandleBase('Jane Doe')).toBe('jane_doe');
	});

	it('collapses repeated . and - and trims leading/trailing . -', () => {
		expect(normalizeDisplayNameToNip05HandleBase('.jane.')).toBe('jane');
		expect(normalizeDisplayNameToNip05HandleBase('-jane-')).toBe('jane');
		expect(normalizeDisplayNameToNip05HandleBase('jane..doe')).toBe('jane.doe');
	});

	it('returns empty when only non-NIP-05 chars remain', () => {
		expect(normalizeDisplayNameToNip05HandleBase('北京')).toBe('');
		expect(normalizeDisplayNameToNip05HandleBase('@@##')).toBe('');
	});

	it('respects maxLength', () => {
		expect(normalizeDisplayNameToNip05HandleBase('abcdefghij', 5)).toBe('abcde');
	});
});

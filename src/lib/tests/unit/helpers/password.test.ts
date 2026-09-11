import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { wordlist as spanishWordlist } from '@scure/bip39/wordlists/spanish.js';
import {
	generatePassword,
	generateSpanishPassword,
	generateEnglishPassword
} from '$lib/utils/helpers/password';

describe('password', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('generatePassword', () => {
		it('should return a string of four space-separated words', () => {
			const result = generatePassword('english');
			const words = result.split(' ');
			expect(words).toHaveLength(4);
			expect(words.every((w) => w.length > 0)).toBe(true);
		});

		it('should return a password with length at least 20 characters', () => {
			const result = generatePassword('english');
			expect(result.length).toBeGreaterThanOrEqual(20);
		});

		it('should use words from English wordlist when language is en', () => {
			const englishWords = new Set(englishWordlist);
			const result = generatePassword('english');
			const words = result.split(' ');
			words.forEach((word) => {
				expect(englishWords.has(word)).toBe(true);
			});
		});

		it('should use words from Spanish wordlist when language is spanish', () => {
			const spanishWords = new Set(spanishWordlist);
			const result = generatePassword('spanish');
			const words = result.split(' ');
			words.forEach((word) => {
				expect(spanishWords.has(word)).toBe(true);
			});
		});

		it('should accept language code "en" and use English wordlist', () => {
			const englishWords = new Set(englishWordlist);
			const result = generatePassword('en');
			const words = result.split(' ');
			words.forEach((word) => {
				expect(englishWords.has(word)).toBe(true);
			});
		});

		it('should fall back to English for unsupported language', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const englishWords = new Set(englishWordlist);
			const result = generatePassword('unsupported');
			const words = result.split(' ');
			words.forEach((word) => {
				expect(englishWords.has(word)).toBe(true);
			});
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining("Language 'unsupported' not supported")
			);
			consoleSpy.mockRestore();
		});
	});

	describe('generateSpanishPassword', () => {
		it('should return four words from Spanish wordlist', () => {
			const spanishWords = new Set(spanishWordlist);
			const result = generateSpanishPassword();
			const words = result.split(' ');
			expect(words).toHaveLength(4);
			words.forEach((word) => {
				expect(spanishWords.has(word)).toBe(true);
			});
		});
	});

	describe('generateEnglishPassword', () => {
		it('should return four words from English wordlist', () => {
			const englishWords = new Set(englishWordlist);
			const result = generateEnglishPassword();
			const words = result.split(' ');
			expect(words).toHaveLength(4);
			words.forEach((word) => {
				expect(englishWords.has(word)).toBe(true);
			});
		});
	});
});

import { describe, it, expect } from 'vitest';
import { parseLinks } from '$lib/utils/helpers/linkParser';

describe('linkParser', () => {
	describe('parseLinks', () => {
		it('should return single text segment when no URLs present', () => {
			const result = parseLinks('plain text only');
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ type: 'text', content: 'plain text only' });
		});

		it('should return single text segment for empty string', () => {
			const result = parseLinks('');
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ type: 'text', content: '' });
		});

		it('should parse https URL and surrounding text', () => {
			const result = parseLinks('check https://example.com out');
			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ type: 'text', content: 'check ' });
			expect(result[1]).toMatchObject({ type: 'link', url: 'https://example.com', content: 'https://example.com' });
			expect(result[2]).toEqual({ type: 'text', content: ' out' });
		});

		it('should parse http URL', () => {
			const result = parseLinks('see http://old.example.org/page');
			expect(result[1].type).toBe('link');
			expect(result[1].url).toBe('http://old.example.org/page');
		});

		it('should add https to www URLs', () => {
			const result = parseLinks('visit www.example.com path');
			expect(result[1].type).toBe('link');
			expect(result[1].url).toBe('https://www.example.com');
			expect(result[1].content).toBe('www.example.com');
		});

		it('should truncate long URLs for display (50 chars)', () => {
			const longPath = 'https://example.com/' + 'a'.repeat(60);
			const result = parseLinks(longPath);
			const linkSegment = result.find((s) => s.type === 'link');
			expect(linkSegment).toBeDefined();
			expect(linkSegment!.content).toHaveLength(50);
			expect(linkSegment!.content.endsWith('...')).toBe(true);
			expect(linkSegment!.url).toBe(longPath);
		});

		it('should parse multiple URLs', () => {
			const result = parseLinks('first https://a.com and https://b.co end');
			expect(result).toHaveLength(5);
			expect(result[1].url).toBe('https://a.com');
			expect(result[3].url).toBe('https://b.co');
		});

		it('should return text only when URL regex does not match', () => {
			const result = parseLinks('no valid url here');
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('text');
			expect(result[0].content).toBe('no valid url here');
		});
	});
});

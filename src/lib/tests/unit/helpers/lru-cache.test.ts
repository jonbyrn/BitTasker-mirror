import { describe, it, expect } from 'vitest';
import { LRUCache } from '$lib/utils/helpers/lru-cache';

describe('lru-cache', () => {
	describe('LRUCache', () => {
		it('should get and set values', () => {
			const cache = new LRUCache<string, number>(10);
			cache.set('a', 1);
			expect(cache.get('a')).toBe(1);
		});

		it('should return undefined for missing key', () => {
			const cache = new LRUCache<string, number>(10);
			expect(cache.get('missing')).toBeUndefined();
		});

		it('should report has correctly', () => {
			const cache = new LRUCache<string, number>(10);
			cache.set('a', 1);
			expect(cache.has('a')).toBe(true);
			expect(cache.has('b')).toBe(false);
		});

		it('should evict least recently used when at capacity', () => {
			const cache = new LRUCache<string, number>(3);
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);
			expect(cache.size).toBe(3);
			cache.set('d', 4);
			expect(cache.has('a')).toBe(false);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBe(2);
			expect(cache.get('c')).toBe(3);
			expect(cache.get('d')).toBe(4);
		});

		it('should promote accessed key to most recently used', () => {
			const cache = new LRUCache<string, number>(3);
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);
			cache.get('a'); // promote a
			cache.set('d', 4); // evict b (LRU)
			expect(cache.has('b')).toBe(false);
			expect(cache.has('a')).toBe(true);
			expect(cache.has('c')).toBe(true);
			expect(cache.has('d')).toBe(true);
		});

		it('should update existing key and retain position', () => {
			const cache = new LRUCache<string, number>(3);
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('a', 10);
			expect(cache.get('a')).toBe(10);
			expect(cache.size).toBe(2);
		});

		it('should clear all entries', () => {
			const cache = new LRUCache<string, number>(10);
			cache.set('a', 1);
			cache.set('b', 2);
			cache.clear();
			expect(cache.size).toBe(0);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.has('b')).toBe(false);
		});

		it('should default maxSize to 1000', () => {
			const cache = new LRUCache<string, number>();
			for (let i = 0; i < 1001; i++) {
				cache.set(`k${i}`, i);
			}
			expect(cache.size).toBe(1000);
			expect(cache.has('k0')).toBe(false);
			expect(cache.has('k1000')).toBe(true);
		});
	});
});

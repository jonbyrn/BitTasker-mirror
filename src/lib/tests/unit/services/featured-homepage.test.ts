import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '$lib/types/task';
import {
	clearFeaturedHomepageCache,
	completeFeaturedSectionState,
	createFeaturedSectionState,
	getFirstImageUrl,
	hasImageAttachment,
	loadFeaturedHomepageItems
} from '$lib/services/featuredHomepage';

describe('featuredHomepage helpers', () => {
	beforeEach(() => {
		clearFeaturedHomepageCache();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('creates the canonical loading state for featured homepage sections', () => {
		expect(createFeaturedSectionState<string>()).toEqual({
			items: [],
			loading: true,
			error: null,
			visible: true
		});
	});

	it('hides empty or errored sections only when the hide-on-empty rule is enabled', () => {
		expect(completeFeaturedSectionState([], null, { hideWhenEmpty: true })).toEqual({
			items: [],
			error: null,
			loading: false,
			visible: false
		});

		expect(completeFeaturedSectionState([], 'failed', { hideWhenEmpty: true })).toEqual({
			items: [],
			error: 'failed',
			loading: false,
			visible: false
		});

		expect(completeFeaturedSectionState(['item'], null, { hideWhenEmpty: true })).toEqual({
			items: ['item'],
			error: null,
			loading: false,
			visible: true
		});
	});

	it('sorts, dedupes, limits, and caches featured homepage items', async () => {
		const fetcher = vi.fn(async () => [
			{ id: 'b', score: 1 },
			{ id: 'a', score: 5 },
			{ id: 'a', score: 3 },
			{ id: 'c', score: 2 }
		]);

		const first = await loadFeaturedHomepageItems({
			cacheKey: 'homepage:test',
			limit: 2,
			fetcher,
			getId: (item) => item.id,
			sorter: (left, right) => right.score - left.score
		});

		expect(first).toEqual([
			{ id: 'a', score: 5 },
			{ id: 'c', score: 2 }
		]);
		expect(fetcher).toHaveBeenCalledTimes(1);

		const second = await loadFeaturedHomepageItems({
			cacheKey: 'homepage:test',
			limit: 3,
			fetcher,
			getId: (item) => item.id,
			sorter: (left, right) => right.score - left.score
		});

		expect(second).toEqual([
			{ id: 'a', score: 5 },
			{ id: 'c', score: 2 },
			{ id: 'b', score: 1 }
		]);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});

	it('reloads the featured cache after the ttl expires', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);

		const fetcher = vi
			.fn()
			.mockResolvedValueOnce([{ id: 'first' }])
			.mockResolvedValueOnce([{ id: 'second' }]);

		const first = await loadFeaturedHomepageItems({
			cacheKey: 'homepage:ttl',
			fetcher,
			getId: (item: unknown) => (item as Record<string, unknown>).id as string
		});
		vi.setSystemTime(301_000);
		const second = await loadFeaturedHomepageItems({
			cacheKey: 'homepage:ttl',
			fetcher,
			getId: (item: unknown) => (item as Record<string, unknown>).id as string
		});

		expect(first).toEqual([{ id: 'first' }]);
		expect(second).toEqual([{ id: 'second' }]);
		expect(fetcher).toHaveBeenCalledTimes(2);
	});

	it('detects and returns the first valid image attachment url', () => {
		const attachments: Attachment[] = [
			{
				url: 'https://cdn.example.com/demo.mp4',
				type: 'video/mp4',
				alt: 'Video',
				key: 'demo.mp4',
				size: 1000
			},
			{
				url: 'https://cdn.example.com/preview.webp',
				type: 'image/webp',
				alt: 'Preview',
				key: 'preview.webp',
				size: 2000
			},
			{
				url: 'https://cdn.example.com/backup.png',
				type: 'image/png',
				alt: 'Backup',
				key: 'backup.png',
				size: 3000
			}
		];

		expect(hasImageAttachment(attachments)).toBe(true);
		expect(getFirstImageUrl(attachments)).toBe('https://cdn.example.com/preview.webp');
		expect(
			hasImageAttachment([
				{
					url: 'https://cdn.example.com/demo.mp4',
					type: 'video/mp4',
					alt: 'Video',
					key: 'demo.mp4',
					size: 1000
				}
			])
		).toBe(false);
		expect(getFirstImageUrl(undefined)).toBe('');
	});
});

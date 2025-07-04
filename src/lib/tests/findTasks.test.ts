import type { Filter } from 'nostr-tools';
import { describe, it, expect } from 'vitest';
import { convertFilterToApiParams } from '$lib/nostr/findTasks';

describe('convertFilterToApiParams', () => {
    it('should convert basic filter properties correctly', () => {
        const filter: Filter = {
            ids: ['id1', 'id2'],
            authors: ['author1', 'author2'],
            kinds: [1, 2, 3],
            since: 1234567890,
            until: 1234567999,
            limit: 10,
            search: 'test search'
        };

        const result = convertFilterToApiParams(filter);

        expect(result).toEqual({
            ids: ['id1', 'id2'],
            authors: ['author1', 'author2'],
            kinds: [1, 2, 3],
            since: 1234567890,
            until: 1234567999,
            limit: 10,
            search: 'test search'
        });
    });

    it('should convert tag filters correctly', () => {
        const filter: Filter = {
            kinds: [1],
            '#c': ['category1', 'category2'],
            '#t': ['tag1', 'tag2'],
            '#s': ['skill1', 'skill2']
        };

        const result = convertFilterToApiParams(filter);

        expect(result).toEqual({
            kinds: [1],
            c: ['category1', 'category2'],
            t: ['tag1', 'tag2'],
            s: ['skill1', 'skill2']
        });
    });

    it('should handle empty filter', () => {
        const filter: Filter = {};
        const result = convertFilterToApiParams(filter);
        expect(result).toEqual({});
    });

    it('should ignore non-array tag values', () => {
        const filter: Filter = {
            kinds: [1],
            '#c': ['category1'],
            // This shouldn't be converted since it's not an array
            '#invalid': 'not-an-array' as any
        };

        const result = convertFilterToApiParams(filter);

        expect(result).toEqual({
            kinds: [1],
            c: ['category1']
        });
    });
}); 
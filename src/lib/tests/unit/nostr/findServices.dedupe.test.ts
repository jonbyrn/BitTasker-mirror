import { describe, expect, it } from 'vitest';
import { dedupeServicesByUniqueId } from '$lib/nostr/findServices';
import type { Service } from '$lib/types/service';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

function createService(overrides: Partial<Service> & { id: string; uniqueId: string }): Service {
	return {
		npub: 'npub1test123456789',
		status: 'active',
		title: `Service ${overrides.uniqueId}`,
		description: 'Test service',
		serviceLocationTypes: [],
		pricing: { type: ServicePricingTypeEnum.FIXED, amount: 100, currency: 'USD' },
		skills: [],
		categories: [],
		createdAt: 1_700_000_000,
		...overrides
	};
}

describe('dedupeServicesByUniqueId', () => {
	it('should return empty array for empty input', () => {
		const result = dedupeServicesByUniqueId([]);
		expect(result).toEqual([]);
	});

	it('should return single service unchanged', () => {
		const service = createService({ id: 'id1', uniqueId: 'unique-1' });
		const result = dedupeServicesByUniqueId([service]);
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual(service);
	});

	it('should keep both services with different uniqueIds', () => {
		const service1 = createService({ id: 'id1', uniqueId: 'unique-1', createdAt: 1_700_000_000 });
		const service2 = createService({ id: 'id2', uniqueId: 'unique-2', createdAt: 1_700_000_001 });
		const result = dedupeServicesByUniqueId([service1, service2]);
		expect(result).toHaveLength(2);
	});

	it('should keep service with newer timestamp when same uniqueId', () => {
		const older = createService({
			id: 'id1',
			uniqueId: 'same-unique',
			createdAt: 1_700_000_000,
			updatedAt: undefined
		});
		const newer = createService({
			id: 'id2',
			uniqueId: 'same-unique',
			createdAt: 1_700_000_001,
			updatedAt: undefined
		});
		const result = dedupeServicesByUniqueId([older, newer]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('id2');
	});

	it('should prefer updatedAt over createdAt for timestamp comparison', () => {
		const olderWithUpdated = createService({
			id: 'id1',
			uniqueId: 'same-unique',
			createdAt: 1_700_000_000,
			updatedAt: 1_700_000_500
		});
		const newerOnlyCreated = createService({
			id: 'id2',
			uniqueId: 'same-unique',
			createdAt: 1_700_000_400,
			updatedAt: undefined
		});
		const result = dedupeServicesByUniqueId([olderWithUpdated, newerOnlyCreated]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('id1');
	});

	it('should keep first service when timestamps are equal', () => {
		const first = createService({
			id: 'id1',
			uniqueId: 'same-unique',
			createdAt: 1_700_000_000
		});
		const second = createService({
			id: 'id2',
			uniqueId: 'same-unique',
			createdAt: 1_700_000_000
		});
		const result = dedupeServicesByUniqueId([first, second]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('id1');
	});

	it('should handle three or more services with duplicates', () => {
		const service1 = createService({ id: 'id1', uniqueId: 'unique-A', createdAt: 1_700_000_001 });
		const service2 = createService({ id: 'id2', uniqueId: 'unique-B', createdAt: 1_700_000_002 });
		const service3 = createService({ id: 'id3', uniqueId: 'unique-A', createdAt: 1_700_000_003 });
		const service4 = createService({ id: 'id4', uniqueId: 'unique-C', createdAt: 1_700_000_004 });
		const service5 = createService({ id: 'id5', uniqueId: 'unique-B', createdAt: 1_700_000_005 });

		const result = dedupeServicesByUniqueId([service1, service2, service3, service4, service5]);

		expect(result).toHaveLength(3);
		const uniqueIds = result.map((s) => s.uniqueId);
		expect(uniqueIds).toContain('unique-A');
		expect(uniqueIds).toContain('unique-B');
		expect(uniqueIds).toContain('unique-C');
		const uniqueA = result.find((s) => s.uniqueId === 'unique-A');
		expect(uniqueA?.id).toBe('id3');
		const uniqueB = result.find((s) => s.uniqueId === 'unique-B');
		expect(uniqueB?.id).toBe('id5');
	});

	it('should handle services with undefined createdAt', () => {
		const service1 = createService({
			id: 'id1',
			uniqueId: 'unique-1',
			createdAt: undefined as unknown as number
		});
		const service2 = createService({
			id: 'id2',
			uniqueId: 'unique-2',
			createdAt: undefined as unknown as number
		});
		const result = dedupeServicesByUniqueId([service1, service2]);
		expect(result).toHaveLength(2);
	});

	it('should fall back to id when uniqueId is empty string and deduplicate by id', () => {
		const service1 = createService({ id: 'same-id', uniqueId: '', createdAt: 1_700_000_001 });
		const service2 = createService({ id: 'same-id', uniqueId: '', createdAt: 1_700_000_002 });
		const result = dedupeServicesByUniqueId([service1, service2]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('same-id');
	});

	it('should use trimmed uniqueId for deduplication', () => {
		const service1 = createService({
			id: 'id1',
			uniqueId: '  spaced-id  ',
			createdAt: 1_700_000_001
		});
		const service2 = createService({
			id: 'id2',
			uniqueId: 'spaced-id',
			createdAt: 1_700_000_002
		});
		const result = dedupeServicesByUniqueId([service1, service2]);
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe('id2');
	});

	it('should preserve order of deduped services (first occurrence wins at equal timestamps)', () => {
		const service1 = createService({ id: 'id1', uniqueId: 'same', createdAt: 1_700_000_000 });
		const service2 = createService({ id: 'id2', uniqueId: 'other', createdAt: 1_700_000_001 });
		const service3 = createService({ id: 'id3', uniqueId: 'same', createdAt: 1_700_000_000 });
		const service4 = createService({ id: 'id4', uniqueId: 'another', createdAt: 1_700_000_002 });

		const result = dedupeServicesByUniqueId([service1, service2, service3, service4]);

		expect(result).toHaveLength(3);
		const uniqueIds = result.map((s) => s.uniqueId);
		expect(uniqueIds).toEqual(['same', 'other', 'another']);
	});
});

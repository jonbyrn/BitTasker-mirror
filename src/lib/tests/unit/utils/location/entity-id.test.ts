import { describe, expect, it } from 'vitest';
import {
	resolveServiceLocationEntityId,
	resolveTaskLocationEntityId
} from '$lib/utils/location/entity-id';

describe('location entity id helpers', () => {
	it('resolves task exact-location ids from the task d tag', () => {
		expect(
			resolveTaskLocationEntityId({
				tags: [
					['d', 'task-dtag-123'],
					['p', 'a'.repeat(64)]
				],
				content: JSON.stringify({
					title: 'Task'
				})
			} as never)
		).toBe('task-dtag-123');
	});

	it('falls back to a task uniqueId in structured content when the d tag is absent', () => {
		expect(
			resolveTaskLocationEntityId({
				tags: [],
				content: JSON.stringify({
					uniqueId: 'task-legacy-123'
				})
			} as never)
		).toBe('task-legacy-123');
	});

	it('normalizes legacy task uniqueIds to the prefixed exact-location entity id format', () => {
		expect(
			resolveTaskLocationEntityId({
				tags: [],
				content: JSON.stringify({
					uniqueId: 'legacy-123'
				})
			} as never)
		).toBe('task-legacy-123');
	});

	it('extracts the service d tag from a service address for exact-location lookups', () => {
		expect(resolveServiceLocationEntityId(`30402:${'a'.repeat(64)}:service-123`)).toBe(
			'service-123'
		);
		expect(resolveServiceLocationEntityId('service-123')).toBe('service-123');
	});
});

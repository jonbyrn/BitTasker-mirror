import { describe, expect, it } from 'vitest';
import {
	SERVICE_EDIT_CONFLICT_CODE,
	createServiceEditConflictError,
	getServiceEditConflictMessage,
	isServiceEditConflictError
} from '$lib/utils/service-edit-conflict';

describe('service edit conflict helpers', () => {
	it('creates a typed conflict error with deterministic metadata', () => {
		const error = createServiceEditConflictError({
			dTag: 'service-123',
			expectedServiceEventId: 'event-old',
			latestServiceEventId: 'event-new'
		});

		expect(error.code).toBe(SERVICE_EDIT_CONFLICT_CODE);
		expect(error.dTag).toBe('service-123');
		expect(error.expectedServiceEventId).toBe('event-old');
		expect(error.latestServiceEventId).toBe('event-new');
		expect(error.message).toContain(SERVICE_EDIT_CONFLICT_CODE);
	});

	it('recognizes conflict errors and exposes the shared recovery message', () => {
		const error = createServiceEditConflictError({
			dTag: 'service-123',
			expectedServiceEventId: 'event-old',
			latestServiceEventId: 'event-new'
		});

		expect(isServiceEditConflictError(error)).toBe(true);
		expect(getServiceEditConflictMessage()).toContain(SERVICE_EDIT_CONFLICT_CODE);
		expect(isServiceEditConflictError(new Error('other'))).toBe(false);
	});
});

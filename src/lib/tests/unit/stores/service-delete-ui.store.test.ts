import { beforeEach, describe, expect, it } from 'vitest';
import type { Service } from '$lib/types/service.d';
import {
	clearPendingServiceDelete,
	filterPendingDeletedServices,
	markServiceDeletePending,
	pendingServiceDeleteStore,
	resetServiceDeleteUiState
} from '$lib/stores/service-delete-ui.store';
import { get } from 'svelte/store';

function createService(overrides: Partial<Service> = {}): Service {
	return {
		id: 'service-event-1',
		uniqueId: 'service-123',
		npub: 'a'.repeat(64),
		status: 'active',
		title: 'Brand Identity Sprint',
		description: 'Logo, color palette, and social avatar pack.',
		serviceLocationTypes: [],
		pricing: {
			type: 'FIXED',
			amount: 200,
			currency: 'USDt'
		},
		skills: [],
		categories: [],
		...overrides
	} as Service;
}

describe('service delete ui store', () => {
	beforeEach(() => {
		resetServiceDeleteUiState();
	});

	it('tracks a pending deletion and filters matching services by unique id', () => {
		const deletedService = createService();
		const survivor = createService({
			id: 'service-event-2',
			uniqueId: 'service-456',
			title: 'Another service'
		});

		markServiceDeletePending(deletedService);

		expect(get(pendingServiceDeleteStore)).toEqual([
			expect.objectContaining({
				key: 'service-123',
				serviceId: 'service-event-1',
				uniqueId: 'service-123',
				title: 'Brand Identity Sprint'
			})
		]);
		expect(filterPendingDeletedServices([deletedService, survivor])).toEqual([survivor]);
	});

	it('restores a service once the pending deletion is cleared', () => {
		const deletedService = createService();

		markServiceDeletePending(deletedService);
		clearPendingServiceDelete(deletedService);

		expect(get(pendingServiceDeleteStore)).toEqual([]);
		expect(filterPendingDeletedServices([deletedService])).toEqual([deletedService]);
	});
});

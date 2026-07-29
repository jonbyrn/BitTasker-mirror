import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInstantBuySnapshot } from '$lib/utils/service-instant-buy/create';
import { createServiceContractFromSnapshot } from '$lib/utils/service-contract/create-from-snapshot';
import { buildServiceAddress } from '$lib/utils/service-quote/protocol';

describe('service instant-buy contract snapshot mapping', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('maps an instant-buy snapshot into service contract params', () => {
		vi.stubGlobal('crypto', {
			randomUUID: () => '123e4567-e89b-12d3-a456-426614174000'
		});

		const service = {
			id: 'service-event-1',
			uniqueId: 'service-123',
			npub: 'a'.repeat(64),
			status: 'active',
			instantBuyLeadHours: 24,
			pricing: {
				type: 'FIXED' as const,
				amount: 150,
				deliveryTime: { min: 2, max: 3, unit: 'day' as const }
			}
		};
		const serviceAddress = buildServiceAddress(
			service as unknown as Parameters<typeof buildServiceAddress>[0]
		);
		const snapshot = createInstantBuySnapshot({
			service,
			nowSeconds: 1_700_000_000
		});

		const contract = createServiceContractFromSnapshot({
			escrowId: snapshot.purchaseKey,
			freelancerPubkey: service.npub,
			amount: '0.00150000',
			estimatedStartTime: snapshot.estimatedStartTime,
			estimatedCompletionTime: snapshot.estimatedEndTime,
			serviceId: service.uniqueId,
			serviceAddress,
			serviceTitle: 'Brand Identity Sprint',
			serviceDescription: 'Logo and palette package.',
			contextVersionRef: service.id,
			purchaseMode: 'instant_buy',
			instantOrderId: snapshot.instantOrderId,
			pricingSnapshot: {
				serviceVersionRef: service.id
			},
			agreementSnapshot: {
				priceSnapshotRef: snapshot.purchaseKey
			}
		});

		expect(contract).toMatchObject({
			escrowId: snapshot.purchaseKey,
			taskId: 'service-123',
			contextType: 'service',
			contextId: 'service-123',
			contextTitle: 'Brand Identity Sprint',
			serviceId: 'service-123',
			serviceAddress,
			purchaseMode: 'instant_buy',
			instantOrderId: snapshot.instantOrderId,
			pricingSnapshot: {
				serviceVersionRef: 'service-event-1'
			},
			agreementSnapshot: {
				priceSnapshotRef: snapshot.purchaseKey
			}
		});
	});
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createInstantBuySnapshot,
	revalidateLatestInstantBuyService
} from '$lib/utils/service-instant-buy/create';

const hoisted = vi.hoisted(() => ({
	mockFindServiceByUniqueId: vi.fn()
}));

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId: (...args: Parameters<typeof hoisted.mockFindServiceByUniqueId>) =>
		hoisted.mockFindServiceByUniqueId(...args)
}));

describe('service instant-buy snapshot creation', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('creates a purchase snapshot for eligible services', () => {
		const snapshot = createInstantBuySnapshot({
			service: {
				status: 'active',
				instantBuyLeadHours: 24,
				pricing: {
					type: 'FIXED',
					amount: 150,
					deliveryTime: { min: 2, max: 3, unit: 'day' }
				}
			},
			nowSeconds: 1_700_000_000
		});

		expect(snapshot.instantOrderId).toMatch(/^sib_[A-Za-z0-9]{16}$/);
		expect(snapshot.purchaseKey).toMatch(/^[a-f0-9]{64}$/);
		expect(snapshot.selectedTierId).toBeUndefined();
		expect(snapshot.estimatedStartTime).toBe(1_700_086_400);
		expect(snapshot.estimatedEndTime).toBe(1_700_345_600);
	});

	it('fails closed when the selected service is not eligible', () => {
		expect(() =>
			createInstantBuySnapshot({
				service: {
					status: 'active',
					pricing: {
						type: 'INQUIRY_REQUIRED'
					}
				}
			})
		).toThrow('invalid_pricing_type');
	});

	it('preserves the selected tier when creating a tiered instant-buy snapshot', () => {
		const snapshot = createInstantBuySnapshot({
			service: {
				status: 'active',
				instantBuyLeadHours: 12,
				pricing: {
					type: 'TIERED',
					tiers: [
						{
							id: 'premium',
							price: 300,
							deliveryTime: { value: 2, unit: 'week' }
						}
					]
				}
			},
			selectedTierId: 'premium',
			nowSeconds: 1_700_000_000
		});

		expect(snapshot.selectedTierId).toBe('premium');
		expect(snapshot.estimatedStartTime).toBe(1_700_043_200);
		expect(snapshot.estimatedEndTime).toBe(1_701_252_800);
	});

	it('reuses a supplied instant order id so retries stay deterministic', () => {
		const snapshot = createInstantBuySnapshot({
			service: {
				status: 'active',
				instantBuyLeadHours: 24,
				pricing: {
					type: 'FIXED',
					amount: 150,
					deliveryTime: { min: 2, max: 3, unit: 'day' }
				}
			},
			nowSeconds: 1_700_000_000,
			instantOrderId: 'sib_existingorder01'
		});

		expect(snapshot.instantOrderId).toBe('sib_existingorder01');
		expect(snapshot.purchaseKey).toMatch(/^[a-f0-9]{64}$/);
	});

	it('fails closed when cryptographic UUID generation is unavailable', () => {
		vi.stubGlobal('crypto', undefined);

		expect(() =>
			createInstantBuySnapshot({
				service: {
					status: 'active',
					instantBuyLeadHours: 24,
					pricing: {
						type: 'FIXED',
						amount: 150,
						deliveryTime: { min: 2, max: 3, unit: 'day' }
					}
				},
				nowSeconds: 1_700_000_000
			})
		).toThrow('Instant buy order id generation is unavailable');
	});

	it('revalidates the latest listing version before create', async () => {
		hoisted.mockFindServiceByUniqueId.mockResolvedValue({
			id: 'service-event-1',
			uniqueId: 'service-123',
			status: 'active',
			instantBuyLeadHours: 24,
			pricing: {
				type: 'FIXED',
				amount: 150,
				deliveryTime: { min: 2, max: 3, unit: 'day' }
			}
		});

		await expect(
			revalidateLatestInstantBuyService({
				serviceId: 'service-123',
				expectedServiceEventId: 'service-event-1'
			})
		).resolves.toMatchObject({
			id: 'service-event-1',
			uniqueId: 'service-123'
		});
		expect(hoisted.mockFindServiceByUniqueId).toHaveBeenCalledWith('service-123');
	});

	it('fails closed when the listing changed or is no longer eligible', async () => {
		hoisted.mockFindServiceByUniqueId.mockResolvedValueOnce({
			id: 'service-event-2',
			uniqueId: 'service-123',
			status: 'active',
			instantBuyLeadHours: 24,
			pricing: {
				type: 'FIXED',
				amount: 150,
				deliveryTime: { min: 2, max: 3, unit: 'day' }
			}
		});

		await expect(
			revalidateLatestInstantBuyService({
				serviceId: 'service-123',
				expectedServiceEventId: 'service-event-1'
			})
		).rejects.toThrow(
			'This service was updated. Refresh the page to review the latest details before using Book Now.'
		);

		hoisted.mockFindServiceByUniqueId.mockResolvedValueOnce({
			id: 'service-event-1',
			uniqueId: 'service-123',
			status: 'inactive',
			instantBuyLeadHours: 24,
			pricing: {
				type: 'FIXED',
				amount: 150,
				deliveryTime: { min: 2, max: 3, unit: 'day' }
			}
		});

		await expect(
			revalidateLatestInstantBuyService({
				serviceId: 'service-123',
				expectedServiceEventId: 'service-event-1'
			})
		).rejects.toThrow('This service is no longer eligible for Book Now.');
	});
});

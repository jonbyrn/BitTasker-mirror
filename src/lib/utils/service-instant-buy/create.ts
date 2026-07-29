import { createServicePurchaseKey } from '$lib/utils/service-quote/accept';
import { findServiceByUniqueId } from '$lib/nostr/service';
import {
	getInstantBuyEligibility,
	type InstantBuyServiceLike
} from '$lib/utils/service-instant-buy/eligibility';
import { deriveServiceInstantBuySchedule } from '$lib/utils/service-instant-buy/time-derivation';
import type { Service } from '$lib/types/service.d';

export interface InstantBuyCreateInput {
	service: InstantBuyServiceLike;
	selectedTierId?: string;
	nowSeconds?: number;
	instantOrderId?: string;
	requestRushDelivery?: boolean;
}

export interface InstantBuyCreateSnapshot {
	instantOrderId: string;
	purchaseKey: string;
	selectedTierId?: string;
	estimatedStartTime: number;
	estimatedEndTime: number;
	requestRushDelivery?: boolean;
}

export interface InstantBuyServiceRevalidationInput {
	serviceId: string;
	expectedServiceEventId?: string | null;
	selectedTierId?: string;
}

function generateInstantOrderId(): string {
	const uuid = globalThis.crypto?.randomUUID?.() ?? null;
	if (!uuid) {
		throw new Error('Instant buy order id generation is unavailable');
	}

	return `sib_${uuid.replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Produces the immutable purchase snapshot used by instant-buy confirmation and contract creation.
 */
export function createInstantBuySnapshot(input: InstantBuyCreateInput): InstantBuyCreateSnapshot {
	const eligibility = getInstantBuyEligibility(input.service, input.selectedTierId);
	if (!eligibility.eligible) {
		throw new Error(`Instant buy not eligible: ${eligibility.code}`);
	}

	const instantOrderId = input.instantOrderId?.trim() || generateInstantOrderId();
	const schedule = deriveServiceInstantBuySchedule(
		input.service,
		input.selectedTierId,
		input.nowSeconds,
		input.requestRushDelivery
	);

	return {
		instantOrderId,
		purchaseKey: createServicePurchaseKey('instant_buy', instantOrderId),
		selectedTierId: input.selectedTierId,
		estimatedStartTime: schedule.estimatedStartTime,
		estimatedEndTime: schedule.estimatedEndTime,
		requestRushDelivery: input.requestRushDelivery
	};
}

/**
 * Re-fetches the latest listing version and fails closed when the loaded snapshot is stale or ineligible.
 */
export async function revalidateLatestInstantBuyService(
	input: InstantBuyServiceRevalidationInput
): Promise<Service> {
	const latestService = await findServiceByUniqueId(input.serviceId);
	if (!latestService) {
		throw new Error('This service is no longer available.');
	}

	if (input.expectedServiceEventId && latestService.id !== input.expectedServiceEventId) {
		throw new Error(
			'This service was updated. Refresh the page to review the latest details before using Book Now.'
		);
	}

	const eligibility = getInstantBuyEligibility(
		latestService as import('$lib/utils/service-instant-buy/eligibility').InstantBuyServiceLike,
		input.selectedTierId
	);
	if (!eligibility.eligible) {
		throw new Error('This service is no longer eligible for Book Now.');
	}

	return latestService;
}

import {
	getInstantBuyEligibility,
	resolveInstantBuyTier,
	type DeliveryTimeLike,
	type InstantBuyServiceLike
} from '$lib/utils/service-instant-buy/eligibility';

const DELIVERY_UNIT_SECONDS = {
	hour: 3600,
	day: 86400,
	week: 604800,
	month: 2592000
} as const;

export interface InstantBuyTimingResult {
	estimatedStartTime: number;
	estimatedEndTime: number;
	deliverySeconds: number;
}

export function deliveryTimeToSeconds(deliveryTime: DeliveryTimeLike): number {
	const deliveryValue = deliveryTime.value ?? deliveryTime.max ?? deliveryTime.min;
	if (!deliveryValue) {
		throw new Error('Missing delivery time value');
	}
	return deliveryValue * DELIVERY_UNIT_SECONDS[deliveryTime.unit];
}

export function deriveInstantBuySchedule(
	nowSeconds: number,
	leadHours: number,
	deliveryTime: DeliveryTimeLike
): InstantBuyTimingResult {
	const estimatedStartTime = nowSeconds + leadHours * 3600;
	const deliverySeconds = deliveryTimeToSeconds(deliveryTime);
	return {
		estimatedStartTime,
		estimatedEndTime: estimatedStartTime + deliverySeconds,
		deliverySeconds
	};
}

export function deriveServiceInstantBuySchedule(
	service: InstantBuyServiceLike,
	selectedTierId?: string,
	nowSeconds = Math.floor(Date.now() / 1000),
	requestRushDelivery = false
): InstantBuyTimingResult {
	const eligibility = getInstantBuyEligibility(service, selectedTierId);
	if (!eligibility.eligible || service.instantBuyLeadHours == null || !service.pricing) {
		throw new Error(`Instant buy not eligible: ${eligibility.code}`);
	}

	if (service.pricing.type === 'FIXED' || service.pricing.type === 'HOURLY') {
		const deliveryTime =
			requestRushDelivery && service.pricing.rushDelivery?.enabled
				? service.pricing.rushDelivery.deliveryTime
				: service.instantBuyDeliveryHours
					? { value: service.instantBuyDeliveryHours, unit: 'hour' as const }
					: service.pricing.deliveryTime!;

		if (!deliveryTime) {
			throw new Error('Instant buy not eligible: missing_delivery_time');
		}
		return deriveInstantBuySchedule(
			nowSeconds,
			service.instantBuyLeadHours,
			deliveryTime as DeliveryTimeLike
		);
	}

	const tier = resolveInstantBuyTier(service, selectedTierId);
	if (!tier) {
		throw new Error('Instant buy not eligible: missing_tier');
	}

	const deliveryTime =
		requestRushDelivery && tier.rushDelivery?.enabled
			? tier.rushDelivery.deliveryTime
			: tier.deliveryTime;

	if (!deliveryTime) {
		throw new Error('Instant buy not eligible: missing_delivery_time');
	}

	return deriveInstantBuySchedule(
		nowSeconds,
		service.instantBuyLeadHours,
		deliveryTime as DeliveryTimeLike
	);
}

import type { ServiceBody, TierDeliveryTime } from '$lib/types/service.d';

type DeliveryUnit = TierDeliveryTime['unit'];

const VALID_UNITS: DeliveryUnit[] = ['hour', 'day', 'week', 'month'];

function isValidUnit(unit: unknown): unit is DeliveryUnit {
	return typeof unit === 'string' && VALID_UNITS.includes(unit as DeliveryUnit);
}

export function formatTierDeliveryTime(value: number, unit: DeliveryUnit): string {
	return `${value} ${unit}${value > 1 ? 's' : ''}`;
}

export function normalizeTierDeliveryTime(input: unknown): TierDeliveryTime | undefined {
	if (!input || typeof input !== 'object') {
		return undefined;
	}

	const record = input as Record<string, unknown>;
	const unit = isValidUnit(record.unit) ? record.unit : 'day';
	const numericValue =
		typeof record.value === 'number'
			? record.value
			: typeof record.max === 'number'
				? record.max
				: typeof record.min === 'number'
					? record.min
					: undefined;

	if (!Number.isFinite(numericValue) || numericValue == null || numericValue <= 0) {
		return undefined;
	}

	const display =
		typeof record.display === 'string' && record.display.trim().length > 0
			? record.display
			: formatTierDeliveryTime(numericValue, unit);

	return {
		value: numericValue,
		unit,
		display
	};
}

export function normalizeServiceTierDeliveryTimes(serviceBody: ServiceBody): ServiceBody {
	if (!serviceBody.pricing?.tiers?.length) {
		return serviceBody;
	}

	return {
		...serviceBody,
		pricing: {
			...serviceBody.pricing,
			tiers: serviceBody.pricing.tiers.map((tier) => ({
				...tier,
				deliveryTime: normalizeTierDeliveryTime(tier.deliveryTime),
				rushDelivery: tier.rushDelivery
					? {
							...tier.rushDelivery,
							deliveryTime:
								normalizeTierDeliveryTime(tier.rushDelivery.deliveryTime) ??
								tier.rushDelivery.deliveryTime
						}
					: tier.rushDelivery
			}))
		}
	};
}

export function tierDeliveryTimeToHours(
	input:
		| Pick<TierDeliveryTime, 'value' | 'unit'>
		| { max?: number; min?: number; unit: string }
		| undefined
): number | undefined {
	if (!input || !isValidUnit(input.unit)) {
		return undefined;
	}

	const value =
		'value' in input && typeof input.value === 'number'
			? input.value
			: 'max' in input && typeof input.max === 'number'
				? input.max
				: 'min' in input && typeof input.min === 'number'
					? input.min
					: undefined;

	if (!Number.isFinite(value) || value == null) {
		return undefined;
	}

	const hoursPerUnit: Record<DeliveryUnit, number> = {
		hour: 1,
		day: 24,
		week: 168,
		month: 720,
		minute: 1 / 60
	};

	return value * hoursPerUnit[input.unit];
}

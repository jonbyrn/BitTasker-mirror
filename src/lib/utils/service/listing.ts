import type { DeliveryTime } from '$lib/types/service';
import {
	type InstantBuyTimeUnit,
	formatInstantBuyDurationInput,
	inferInstantBuyTimeUnit
} from '$lib/utils/service-instant-buy/authoring';

export type ServicePriceCurrency = 'USD' | 'USDT';

/** USD, or USDT for the usdt_rgb rail. Legacy USDt is USDT. */
export function normalizeServicePriceCurrency(
	currency: string | null | undefined
): ServicePriceCurrency {
	const value = currency?.trim().toUpperCase().replace(/\s+/g, '') ?? '';
	return value === 'USDT' ? 'USDT' : 'USD';
}

export function formatServicePriceAmount(
	amount: number,
	currency: string | null | undefined
): string {
	const formatted = new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(amount);
	return normalizeServicePriceCurrency(currency) === 'USDT' ? `${formatted} USDT` : `$${formatted}`;
}

/** A listing can store a wallet address that is already open. Publishing does not unlock one. */
export function providerWalletForPublish(
	...candidates: Array<string | null | undefined>
): string | undefined {
	for (const candidate of candidates) {
		const trimmed = candidate?.trim();
		if (trimmed) return trimmed;
	}
	return undefined;
}

export function createServiceAliasPath(
	serviceId: string | null | undefined
): '/create-service' | null {
	return serviceId?.trim().toLowerCase() === 'new' ? '/create-service' : null;
}

export function deliveryTimeFromHours(
	hours: number | null | undefined,
	unit?: InstantBuyTimeUnit
): DeliveryTime | undefined {
	if (hours == null || !Number.isFinite(hours) || hours < 1) return undefined;
	const resolved = unit ?? inferInstantBuyTimeUnit(hours);
	const raw = formatInstantBuyDurationInput(hours, resolved);
	const value = Number(raw);
	if (!Number.isFinite(value) || value <= 0) return undefined;
	const displayUnit = value === 1 ? resolved : `${resolved}s`;
	return {
		min: value,
		max: value,
		unit: resolved,
		display: `${raw} ${displayUnit}`
	};
}

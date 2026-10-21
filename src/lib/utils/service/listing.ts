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

type ServicePriceInput = {
	type?: string | null;
	amount?: number | null;
	hourlyRate?: number | null;
	currency?: string | null;
	tiers?: Array<{ price?: number | null }> | null;
};

/** One price string. Hourly rates include /hr, and the currency is written once. */
export function formatServicePriceLine(
	pricing: ServicePriceInput | null | undefined,
	quoteLabel = 'Request Quote'
): string {
	if (!pricing) return '';
	const money = (amount: number) => formatServicePriceAmount(amount, pricing.currency);
	if (pricing.type === 'HOURLY') {
		const rate = pricing.hourlyRate ?? pricing.amount;
		return typeof rate === 'number' ? `${money(rate)}/hr` : '';
	}
	if (pricing.type === 'TIERED') {
		const prices = (pricing.tiers ?? [])
			.map((tier) => tier.price)
			.filter((price): price is number => typeof price === 'number');
		return prices.length ? money(Math.min(...prices)) : '';
	}
	if (pricing.type === 'INQUIRY_REQUIRED') return quoteLabel;
	if (typeof pricing.amount === 'number') return money(pricing.amount);
	if (typeof pricing.hourlyRate === 'number') return `${money(pricing.hourlyRate)}/hr`;
	return '';
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

/** Shareable service page. Prefers the public id, then the event id. */
export function servicePagePath(service: { uniqueId?: string | null; id?: string | null }): string {
	const id = service.uniqueId?.trim() || service.id?.trim() || '';
	return `/services/${encodeURIComponent(id)}`;
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

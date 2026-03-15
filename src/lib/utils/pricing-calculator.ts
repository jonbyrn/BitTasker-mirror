import type { ServiceTier, ServiceAddOn } from '$lib/types/service.d';

export interface PricingBreakdown {
	basePriceLabel: string;
	basePrice: number;
	addOnsLabel: string;
	addOnsTotal: number;
	currencySymbol: string;
	finalTotal: number;
	addOnsList?: Array<{ name: string; price: number }>;
}

/**
 * Calculate pricing breakdown for a service with selected tier and add-ons
 */
export function calculatePricingBreakdown(
	basePrice: number,
	selectedAddOns: ServiceAddOn[],
	currencySymbol: string = '$'
): PricingBreakdown {
	const addOnsTotal = selectedAddOns.reduce((sum, addOn) => sum + (addOn.price ?? 0), 0);
	const finalTotal = basePrice + addOnsTotal;

	return {
		basePriceLabel: 'Base Price',
		basePrice,
		addOnsLabel: 'Add-ons',
		addOnsTotal,
		currencySymbol,
		finalTotal,
		addOnsList: selectedAddOns.map((addOn) => ({
			name: addOn.name,
			price: addOn.price ?? 0
		}))
	};
}

/**
 * Format pricing for display
 */
export function formatPricing(amount: number, currency: string = 'USD'): string {
	const formatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	});

	return formatter.format(amount);
}

/**
 * Get tier display with price
 */
export function getTierDisplayWithPrice(tier: ServiceTier, currency: string = 'USD'): string {
	const price = tier.price ?? 0;
	return `${tier.name} - ${formatPricing(price, currency)}`;
}

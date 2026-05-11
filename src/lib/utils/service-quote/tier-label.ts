import type { Service } from '$lib/types/service';

export function resolveServiceTierLabel(
	service: Pick<Service, 'pricing'> | null | undefined,
	tierId: string | null | undefined
): string | null {
	if (!tierId) {
		return null;
	}

	return service?.pricing?.tiers?.find((tier) => tier.id === tierId)?.name ?? null;
}

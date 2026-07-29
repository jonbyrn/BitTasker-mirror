export function hashSearchParams(params: Record<string, unknown>): string {
	const parts: string[] = [];
	if (params.search) parts.push(`s:${params.search}`);
	if (params.page) parts.push(`p:${params.page}`);
	if (params.limit) parts.push(`l:${params.limit}`);
	const cats = params.categories as string[] | undefined;
	if (cats?.length) {
		parts.push(`c:${[...cats].sort().join(',')}`);
	}
	const skillz = params.skills as string[] | undefined;
	if (skillz?.length) {
		parts.push(`sk:${[...skillz].sort().join(',')}`);
	}
	const locTypes = params.serviceLocationTypes as string[] | undefined;
	if (locTypes?.length) {
		parts.push(`loc:${[...locTypes].sort().join(',')}`);
	}
	if (params.pricingType) parts.push(`pt:${params.pricingType}`);
	if (params.minPrice !== undefined) parts.push(`min:${params.minPrice}`);
	if (params.maxPrice !== undefined) parts.push(`max:${params.maxPrice}`);
	if (params.deliveryTime !== undefined) parts.push(`dt:${params.deliveryTime}`);
	if (params.location) parts.push(`locn:${params.location}`);
	const coords = params.locationCoords as { latitude: number; longitude: number } | undefined;
	if (coords) {
		parts.push(`locc:${coords.latitude},${coords.longitude}`);
	}
	return parts.join('|');
}

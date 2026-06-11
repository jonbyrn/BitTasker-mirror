export function hashSearchParams(params: {
	search?: string;
	page?: number;
	limit?: number;
	categories?: string[];
	skills?: string[];
	serviceLocationTypes?: string[];
	pricingType?: string;
	minPrice?: number;
	maxPrice?: number;
	deliveryTime?: number;
	location?: string;
	locationCoords?: { latitude: number; longitude: number };
}): string {
	const parts: string[] = [];
	if (params.search) parts.push(`s:${params.search}`);
	if (params.page) parts.push(`p:${params.page}`);
	if (params.limit) parts.push(`l:${params.limit}`);
	if (params.categories?.length) {
		parts.push(`c:${[...params.categories].sort().join(',')}`);
	}
	if (params.skills?.length) {
		parts.push(`sk:${[...params.skills].sort().join(',')}`);
	}
	if (params.serviceLocationTypes?.length) {
		parts.push(`loc:${[...params.serviceLocationTypes].sort().join(',')}`);
	}
	if (params.pricingType) parts.push(`pt:${params.pricingType}`);
	if (params.minPrice !== undefined) parts.push(`min:${params.minPrice}`);
	if (params.maxPrice !== undefined) parts.push(`max:${params.maxPrice}`);
	if (params.deliveryTime !== undefined) parts.push(`dt:${params.deliveryTime}`);
	if (params.location) parts.push(`locn:${params.location}`);
	if (params.locationCoords) {
		parts.push(`locc:${params.locationCoords.latitude},${params.locationCoords.longitude}`);
	}
	return parts.join('|');
}

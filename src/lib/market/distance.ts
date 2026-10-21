export function distanceKm(
	from: { latitude: number; longitude: number },
	to: { latitude: number; longitude: number }
): number {
	const radians = Math.PI / 180;
	const dLat = (to.latitude - from.latitude) * radians;
	const dLng = (to.longitude - from.longitude) * radians;
	const lat1 = from.latitude * radians;
	const lat2 = to.latitude * radians;
	const haversine =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/**
 * Web Mercator tile math for the keyless listing map.
 * OpenStreetMap raster tiles need no API key. The sandbox does not ship a
 * Google Maps key, and a rejected key falls back to this map.
 */

export const TILE_SIZE = 256;
/** The B pin is 56px. This anchor gap keeps two boxes from covering each other. */
export const PIN_SPIDER_DISTANCE = 80;
/** Room for the pin body and a spider arm so a fitted pin stays on screen. */
export const PIN_VIEW_PADDING = 96;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;
export const LISTING_MAP_FALLBACK = { latitude: 13.6929, longitude: -89.2182, zoom: 6 };

const MAX_LATITUDE = 85.05112878;

export function clampLatitude(latitude: number): number {
	return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
}

export function worldPixelX(longitude: number, zoom: number): number {
	const scale = TILE_SIZE * 2 ** zoom;
	return ((longitude + 180) / 360) * scale;
}

export function worldPixelY(latitude: number, zoom: number): number {
	const latitudeRad = (clampLatitude(latitude) * Math.PI) / 180;
	const scale = TILE_SIZE * 2 ** zoom;
	const mercator = Math.log(Math.tan(Math.PI / 4 + latitudeRad / 2));
	return ((1 - mercator / Math.PI) / 2) * scale;
}

export function longitudeFromWorldPixel(x: number, zoom: number): number {
	const scale = TILE_SIZE * 2 ** zoom;
	return (x / scale) * 360 - 180;
}

export function latitudeFromWorldPixel(y: number, zoom: number): number {
	const scale = TILE_SIZE * 2 ** zoom;
	const mercator = Math.PI * (1 - (2 * y) / scale);
	return (180 / Math.PI) * Math.atan(Math.sinh(mercator));
}

export interface MapTile {
	key: string;
	left: number;
	top: number;
	url: string;
}

/** Public OSM raster tiles. Override with VITE_MAP_TILE_URL, a non-secret https template. */
export const DEFAULT_OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function resolveTileTemplate(configured?: string | null): string {
	if (typeof configured !== 'string') return DEFAULT_OSM_TILE_URL;
	const template = configured.trim();
	const publicTemplate =
		template.startsWith('https://') &&
		template.includes('{z}') &&
		template.includes('{x}') &&
		template.includes('{y}') &&
		!/[?&](key|api_key|apikey|token|secret)=/i.test(template);
	return publicTemplate ? template : DEFAULT_OSM_TILE_URL;
}

export function mapTileTemplate(): string {
	return resolveTileTemplate(import.meta.env.VITE_MAP_TILE_URL);
}

export function openStreetMapTileUrl(zoom: number, x: number, y: number): string {
	const tileCount = 2 ** zoom;
	const wrappedX = ((x % tileCount) + tileCount) % tileCount;
	const subdomain = ['a', 'b', 'c'][Math.abs(wrappedX) % 3];
	return mapTileTemplate()
		.replaceAll('{z}', String(zoom))
		.replaceAll('{x}', String(wrappedX))
		.replaceAll('{y}', String(y))
		.replaceAll('{s}', subdomain)
		.replaceAll('{r}', '');
}

export function visibleTiles(
	centerLatitude: number,
	centerLongitude: number,
	zoom: number,
	width: number,
	height: number
): MapTile[] {
	if (width <= 0 || height <= 0) return [];
	const originX = worldPixelX(centerLongitude, zoom) - width / 2;
	const originY = worldPixelY(centerLatitude, zoom) - height / 2;
	const minX = Math.floor(originX / TILE_SIZE);
	const maxX = Math.floor((originX + width) / TILE_SIZE);
	const minY = Math.floor(originY / TILE_SIZE);
	const maxY = Math.floor((originY + height) / TILE_SIZE);
	const tileCount = 2 ** zoom;
	const tiles: MapTile[] = [];
	for (let x = minX; x <= maxX; x++) {
		for (let y = minY; y <= maxY; y++) {
			if (y < 0 || y >= tileCount) continue;
			tiles.push({
				key: `${zoom}/${x}/${y}`,
				left: x * TILE_SIZE - originX,
				top: y * TILE_SIZE - originY,
				url: openStreetMapTileUrl(zoom, x, y)
			});
		}
	}
	return tiles;
}

export function pointPixel(
	latitude: number,
	longitude: number,
	centerLatitude: number,
	centerLongitude: number,
	zoom: number,
	width: number,
	height: number
): { left: number; top: number } {
	const originX = worldPixelX(centerLongitude, zoom) - width / 2;
	const originY = worldPixelY(centerLatitude, zoom) - height / 2;
	return {
		left: worldPixelX(longitude, zoom) - originX,
		top: worldPixelY(latitude, zoom) - originY
	};
}

export interface ScreenPoint {
	left: number;
	top: number;
}

/**
 * Pull markers that land on the same pixels apart so each one can be clicked.
 * A country-wide fit leaves San Benito and Santa Tecla a few pixels apart, and
 * the later pin then covers the earlier one.
 */
export function spiderfyScreenPoints<T extends ScreenPoint>(points: T[], minDistance = 64): T[] {
	if (points.length < 2 || minDistance <= 0) return points;
	const parent = points.map((_, index) => index);
	const find = (index: number): number => {
		let cursor = index;
		while (parent[cursor] !== cursor) {
			parent[cursor] = parent[parent[cursor]];
			cursor = parent[cursor];
		}
		return cursor;
	};
	const unite = (left: number, right: number) => {
		parent[find(left)] = find(right);
	};
	const limit = minDistance * minDistance;
	for (let left = 0; left < points.length; left++) {
		for (let right = left + 1; right < points.length; right++) {
			const dx = points[left].left - points[right].left;
			const dy = points[left].top - points[right].top;
			if (dx * dx + dy * dy < limit) unite(left, right);
		}
	}
	const groups = new Map<number, number[]>();
	points.forEach((_, index) => {
		const root = find(index);
		const group = groups.get(root);
		if (group) group.push(index);
		else groups.set(root, [index]);
	});
	const placed = points.slice();
	for (const indexes of groups.values()) {
		if (indexes.length < 2) continue;
		const centerLeft = indexes.reduce((sum, index) => sum + points[index].left, 0) / indexes.length;
		const centerTop = indexes.reduce((sum, index) => sum + points[index].top, 0) / indexes.length;
		const radius = minDistance / (2 * Math.sin(Math.PI / indexes.length));
		indexes.forEach((index, order) => {
			const angle = -Math.PI / 2 + (2 * Math.PI * order) / indexes.length;
			placed[index] = {
				...points[index],
				left: centerLeft + radius * Math.cos(angle),
				top: centerTop + radius * Math.sin(angle)
			};
		});
	}
	return placed;
}

export interface GeoPoint {
	latitude: number;
	longitude: number;
}

/**
 * Move pins that overlap at this zoom onto a circle, and leave the real
 * coordinates on each point. Google markers and the keyless map both use this
 * so a country fit cannot stack San Benito on Santa Tecla.
 */
export function offsetOverlappingPins<T extends GeoPoint>(
	points: T[],
	centerLatitude: number,
	centerLongitude: number,
	zoom: number,
	width: number,
	height: number,
	minDistance = PIN_SPIDER_DISTANCE
): Array<T & { displayLatitude: number; displayLongitude: number }> {
	const unchanged = () =>
		points.map((point) => ({
			...point,
			displayLatitude: point.latitude,
			displayLongitude: point.longitude
		}));
	if (points.length === 0 || width <= 0 || height <= 0 || !Number.isFinite(zoom))
		return unchanged();
	const originX = worldPixelX(centerLongitude, zoom) - width / 2;
	const originY = worldPixelY(centerLatitude, zoom) - height / 2;
	const projected = points.map((point) => ({
		point,
		...pointPixel(
			point.latitude,
			point.longitude,
			centerLatitude,
			centerLongitude,
			zoom,
			width,
			height
		)
	}));
	return spiderfyScreenPoints(projected, minDistance).map((entry) => ({
		...entry.point,
		displayLatitude: latitudeFromWorldPixel(originY + entry.top, zoom),
		displayLongitude: longitudeFromWorldPixel(originX + entry.left, zoom)
	}));
}

/** Dragging the map right (positive deltaX) reveals the west. */
export function panCenter(
	centerLatitude: number,
	centerLongitude: number,
	zoom: number,
	deltaX: number,
	deltaY: number
): { latitude: number; longitude: number } {
	return {
		latitude: latitudeFromWorldPixel(worldPixelY(centerLatitude, zoom) - deltaY, zoom),
		longitude: longitudeFromWorldPixel(worldPixelX(centerLongitude, zoom) - deltaX, zoom)
	};
}

export function fitView(
	points: Array<{ latitude: number; longitude: number }>,
	width: number,
	height: number,
	padding = PIN_VIEW_PADDING
): { latitude: number; longitude: number; zoom: number } {
	if (points.length === 0 || width <= 0 || height <= 0) {
		return { ...LISTING_MAP_FALLBACK };
	}
	const latitudes = points.map((point) => point.latitude);
	const longitudes = points.map((point) => point.longitude);
	const latitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
	const longitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
	if (points.length === 1) {
		return { latitude, longitude, zoom: 12 };
	}
	const innerWidth = Math.max(1, width - padding * 2);
	const innerHeight = Math.max(1, height - padding * 2);
	for (let zoom = 14; zoom >= MIN_ZOOM; zoom--) {
		const xs = points.map((point) => worldPixelX(point.longitude, zoom));
		const ys = points.map((point) => worldPixelY(point.latitude, zoom));
		if (
			Math.max(...xs) - Math.min(...xs) <= innerWidth &&
			Math.max(...ys) - Math.min(...ys) <= innerHeight
		) {
			return { latitude, longitude, zoom };
		}
	}
	return { latitude, longitude, zoom: MIN_ZOOM };
}

/**
 * Web Mercator tile math for the keyless listing map.
 * OpenStreetMap raster tiles need no API key. The sandbox does not ship a
 * Google Maps key, and a rejected key falls back to this map.
 */

export const TILE_SIZE = 256;
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
	padding = 48
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

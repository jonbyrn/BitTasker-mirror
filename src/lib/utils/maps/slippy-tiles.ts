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

export interface ViewPadding {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export type ProjectFn = (latitude: number, longitude: number) => ScreenPoint | null;
export type UnprojectFn = (left: number, top: number) => GeoPoint | null;

/** Room under the pins for the bottom nav, plus one spider arm. */
export function listingFitPadding(bottomOverlay = 0): ViewPadding {
	const overlay = Number.isFinite(bottomOverlay) ? Math.max(0, bottomOverlay) : 0;
	return {
		top: PIN_VIEW_PADDING,
		right: PIN_VIEW_PADDING,
		bottom: PIN_VIEW_PADDING + overlay + PIN_SPIDER_DISTANCE / 2,
		left: PIN_VIEW_PADDING
	};
}

/** Shrink padding so a short map can still frame the pins. */
export function clampViewPadding(padding: ViewPadding, width: number, height: number): ViewPadding {
	const maxVertical = Math.max(8, height - 32);
	const maxHorizontal = Math.max(8, width - 32);
	let { top, right, bottom, left } = padding;
	const vertical = top + bottom;
	const horizontal = left + right;
	if (vertical > maxVertical && vertical > 0) {
		const scale = maxVertical / vertical;
		top *= scale;
		bottom *= scale;
	}
	if (horizontal > maxHorizontal && horizontal > 0) {
		const scale = maxHorizontal / horizontal;
		left *= scale;
		right *= scale;
	}
	return { top, right, bottom, left };
}

function closestGap(points: ScreenPoint[]): number {
	let closest = Infinity;
	for (let left = 0; left < points.length; left++) {
		for (let right = left + 1; right < points.length; right++) {
			const dx = points[left].left - points[right].left;
			const dy = points[left].top - points[right].top;
			const gap = Math.hypot(dx, dy);
			if (gap < closest) closest = gap;
		}
	}
	return closest;
}

/**
 * Spiderfy from the real anchors in the same pixel space the map will draw,
 * then measure the projected gap. When project and unproject are not inverses
 * (Google's camera versus Web Mercator), grow the requested distance until the
 * drawn gap is at least `minDistance`.
 */
export function enforcePinSeparation<T extends GeoPoint>(
	points: T[],
	project: ProjectFn,
	unproject: UnprojectFn,
	minDistance = PIN_SPIDER_DISTANCE
): Array<T & { displayLatitude: number; displayLongitude: number }> {
	const unchanged = () =>
		points.map((point) => ({
			...point,
			displayLatitude: point.latitude,
			displayLongitude: point.longitude
		}));
	if (points.length === 0 || minDistance <= 0) return unchanged();
	const anchors = points.map((point) => {
		const pixel = project(point.latitude, point.longitude);
		if (!pixel || !Number.isFinite(pixel.left) || !Number.isFinite(pixel.top)) return null;
		return { point, left: pixel.left, top: pixel.top };
	});
	if (anchors.some((anchor) => anchor == null)) return unchanged();
	const projected = anchors as Array<{ point: T; left: number; top: number }>;
	let requested = minDistance;
	let placed = spiderfyScreenPoints(projected, requested);
	let display = unchanged();
	for (let attempt = 0; attempt < 8; attempt++) {
		const geo = placed.map((entry) => unproject(entry.left, entry.top));
		if (geo.some((point) => point == null)) return display;
		const located = geo as GeoPoint[];
		const reprojected = located.map((point) => project(point.latitude, point.longitude));
		if (reprojected.some((pixel) => pixel == null)) return display;
		const pixels = reprojected as ScreenPoint[];
		display = placed.map((entry, index) => ({
			...entry.point,
			displayLatitude: located[index].latitude,
			displayLongitude: located[index].longitude
		}));
		const gap = closestGap(pixels);
		if (gap + 0.05 >= minDistance) return display;
		requested *= !Number.isFinite(gap) || gap <= 1 ? 1.5 : (minDistance / gap) * 1.08;
		placed = spiderfyScreenPoints(projected, requested);
	}
	return display;
}

/**
 * Move pins that overlap at this zoom onto a circle, and leave the real
 * coordinates on each point. The keyless map draws with this same Mercator.
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
	if (points.length === 0 || width <= 0 || height <= 0 || !Number.isFinite(zoom)) {
		return points.map((point) => ({
			...point,
			displayLatitude: point.latitude,
			displayLongitude: point.longitude
		}));
	}
	const originX = worldPixelX(centerLongitude, zoom) - width / 2;
	const originY = worldPixelY(centerLatitude, zoom) - height / 2;
	return enforcePinSeparation(
		points,
		(latitude, longitude) =>
			pointPixel(latitude, longitude, centerLatitude, centerLongitude, zoom, width, height),
		(left, top) => ({
			latitude: latitudeFromWorldPixel(originY + top, zoom),
			longitude: longitudeFromWorldPixel(originX + left, zoom)
		}),
		minDistance
	);
}

function viewPadding(padding: number | ViewPadding): ViewPadding {
	if (typeof padding === 'number') {
		const edge = Number.isFinite(padding) ? Math.max(0, padding) : PIN_VIEW_PADDING;
		return { top: edge, right: edge, bottom: edge, left: edge };
	}
	return padding;
}

export function fitView(
	points: Array<{ latitude: number; longitude: number }>,
	width: number,
	height: number,
	padding: number | ViewPadding = PIN_VIEW_PADDING
): { latitude: number; longitude: number; zoom: number } {
	if (points.length === 0 || width <= 0 || height <= 0) {
		return { ...LISTING_MAP_FALLBACK };
	}
	const pad = viewPadding(padding);
	const latitudes = points.map((point) => point.latitude);
	const longitudes = points.map((point) => point.longitude);
	const midLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
	const midLongitude = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
	const shift = (zoom: number, latitude: number, longitude: number) => {
		const x = worldPixelX(longitude, zoom) - (pad.left - pad.right) / 2;
		const y = worldPixelY(latitude, zoom) - (pad.top - pad.bottom) / 2;
		return {
			latitude: latitudeFromWorldPixel(y, zoom),
			longitude: longitudeFromWorldPixel(x, zoom)
		};
	};
	const nudged = pad.top !== pad.bottom || pad.left !== pad.right;
	const frame = (zoom: number) =>
		nudged
			? { ...shift(zoom, midLatitude, midLongitude), zoom }
			: { latitude: midLatitude, longitude: midLongitude, zoom };
	if (points.length === 1) return frame(12);
	const innerWidth = Math.max(1, width - pad.left - pad.right);
	const innerHeight = Math.max(1, height - pad.top - pad.bottom);
	for (let zoom = 14; zoom >= MIN_ZOOM; zoom--) {
		const xs = points.map((point) => worldPixelX(point.longitude, zoom));
		const ys = points.map((point) => worldPixelY(point.latitude, zoom));
		if (
			Math.max(...xs) - Math.min(...xs) <= innerWidth &&
			Math.max(...ys) - Math.min(...ys) <= innerHeight
		) {
			return frame(zoom);
		}
	}
	return frame(MIN_ZOOM);
}

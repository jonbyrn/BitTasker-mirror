import { describe, expect, it } from 'vitest';
import {
	DEFAULT_OSM_TILE_URL,
	TILE_SIZE,
	PIN_SPIDER_DISTANCE,
	PIN_VIEW_PADDING,
	fitView,
	offsetOverlappingPins,
	panCenter,
	pointPixel,
	spiderfyScreenPoints,
	resolveTileTemplate,
	visibleTiles,
	worldPixelX,
	worldPixelY
} from '$lib/utils/maps/slippy-tiles';

describe('slippy tiles', () => {
	it('places the equator and prime meridian at the center of zoom 0', () => {
		expect(worldPixelX(0, 0)).toBe(TILE_SIZE / 2);
		expect(worldPixelY(0, 0)).toBeCloseTo(TILE_SIZE / 2, 5);
	});

	it('keeps the center point in the middle of the viewport', () => {
		const pixel = pointPixel(4.711, -74.0721, 4.711, -74.0721, 8, 400, 300);
		expect(pixel.left).toBe(200);
		expect(pixel.top).toBe(150);
	});

	it('covers the viewport with OpenStreetMap tiles and no API key', () => {
		const tiles = visibleTiles(4.711, -74.0721, 4, 256, 256);
		expect(tiles.length).toBeGreaterThan(0);
		expect(tiles.every((tile) => tile.url.startsWith('https://tile.openstreetmap.org/4/'))).toBe(
			true
		);
		expect(tiles.some((tile) => tile.url.includes('apikey') || tile.url.includes('key='))).toBe(
			false
		);
	});

	it('pans west when the map is dragged to the right', () => {
		const next = panCenter(4.711, -74.0721, 10, 80, 0);
		expect(next.longitude).toBeLessThan(-74.0721);
		expect(next.latitude).toBeCloseTo(4.711, 4);
	});

	it('spreads San Benito and Santa Tecla when a country fit leaves them a few pixels apart', () => {
		const places = [
			{ id: 'tunco', latitude: 13.4926, longitude: -89.3836 },
			{ id: 'benito', latitude: 13.6946, longitude: -89.2404 },
			{ id: 'tecla', latitude: 13.6769, longitude: -89.2797 },
			{ id: 'miguel', latitude: 13.4765, longitude: -88.1772 },
			{ id: 'juayua', latitude: 13.8414, longitude: -89.7456 }
		];
		const view = fitView(places, 520, 512);
		const pixels = places.map((place) => ({
			id: place.id,
			...pointPixel(
				place.latitude,
				place.longitude,
				view.latitude,
				view.longitude,
				view.zoom,
				520,
				512
			)
		}));
		const before = pixels.filter((place) => place.id === 'benito' || place.id === 'tecla');
		const rawGap = Math.hypot(before[0].left - before[1].left, before[0].top - before[1].top);
		expect(rawGap).toBeLessThan(56);
		const spread = spiderfyScreenPoints(pixels, PIN_SPIDER_DISTANCE);
		const after = spread.filter((place) => place.id === 'benito' || place.id === 'tecla');
		const gap = Math.hypot(after[0].left - after[1].left, after[0].top - after[1].top);
		expect(gap).toBeGreaterThanOrEqual(PIN_SPIDER_DISTANCE);
		const covers = (left: (typeof after)[number], right: (typeof after)[number]) =>
			Math.abs(left.left - right.left) < 56 && Math.abs(left.top - right.top) < 56;
		expect(covers(after[0], after[1])).toBe(false);
		expect(spread.find((place) => place.id === 'benito')?.id).toBe('benito');
		expect(spread.find((place) => place.id === 'tecla')?.id).toBe('tecla');
		const offset = offsetOverlappingPins(
			places,
			view.latitude,
			view.longitude,
			view.zoom,
			520,
			512
		);
		const benito = offset.find((place) => place.id === 'benito');
		const tecla = offset.find((place) => place.id === 'tecla');
		expect(benito && tecla).toBeTruthy();
		const benitoPx = pointPixel(
			benito!.displayLatitude,
			benito!.displayLongitude,
			view.latitude,
			view.longitude,
			view.zoom,
			520,
			512
		);
		const teclaPx = pointPixel(
			tecla!.displayLatitude,
			tecla!.displayLongitude,
			view.latitude,
			view.longitude,
			view.zoom,
			520,
			512
		);
		expect(
			Math.hypot(benitoPx.left - teclaPx.left, benitoPx.top - teclaPx.top)
		).toBeGreaterThanOrEqual(PIN_SPIDER_DISTANCE);
		expect(
			Math.abs(benitoPx.left - teclaPx.left) < 56 && Math.abs(benitoPx.top - teclaPx.top) < 56
		).toBe(false);
	});

	it('fits all five shift pins inside a 375px map and keeps them apart', () => {
		const places = [
			{ id: 'tunco', latitude: 13.4926, longitude: -89.3836 },
			{ id: 'benito', latitude: 13.6946, longitude: -89.2404 },
			{ id: 'tecla', latitude: 13.6769, longitude: -89.2797 },
			{ id: 'miguel', latitude: 13.4765, longitude: -88.1772 },
			{ id: 'juayua', latitude: 13.8414, longitude: -89.7456 }
		];
		const width = 375;
		const height = 467;
		const view = fitView(places, width, height, PIN_VIEW_PADDING);
		const placed = offsetOverlappingPins(
			places,
			view.latitude,
			view.longitude,
			view.zoom,
			width,
			height
		);
		for (const place of placed) {
			const pixel = pointPixel(
				place.displayLatitude,
				place.displayLongitude,
				view.latitude,
				view.longitude,
				view.zoom,
				width,
				height
			);
			expect(pixel.left).toBeGreaterThanOrEqual(28);
			expect(pixel.left).toBeLessThanOrEqual(width - 28);
			expect(pixel.top).toBeGreaterThanOrEqual(56);
			expect(pixel.top).toBeLessThanOrEqual(height);
		}
		const benito = placed.find((place) => place.id === 'benito');
		const tecla = placed.find((place) => place.id === 'tecla');
		const benitoPx = pointPixel(
			benito!.displayLatitude,
			benito!.displayLongitude,
			view.latitude,
			view.longitude,
			view.zoom,
			width,
			height
		);
		const teclaPx = pointPixel(
			tecla!.displayLatitude,
			tecla!.displayLongitude,
			view.latitude,
			view.longitude,
			view.zoom,
			width,
			height
		);
		expect(
			Math.hypot(benitoPx.left - teclaPx.left, benitoPx.top - teclaPx.top)
		).toBeGreaterThanOrEqual(PIN_SPIDER_DISTANCE);
	});

	it('frames one pin tightly and distant pins at a wider zoom', () => {
		const single = fitView([{ latitude: 0, longitude: 0 }], 800, 600);
		expect(single.zoom).toBe(12);
		expect(single.latitude).toBe(0);
		const wide = fitView(
			[
				{ latitude: 4.711, longitude: -74.0721 },
				{ latitude: 13.4886, longitude: -89.3222 }
			],
			800,
			600
		);
		expect(wide.zoom).toBeLessThan(12);
	});

	it('uses a public tile template and rejects keyed or non-https overrides', () => {
		expect(resolveTileTemplate(undefined)).toBe(DEFAULT_OSM_TILE_URL);
		expect(resolveTileTemplate('https://tiles.example/{z}/{x}/{y}.png')).toBe(
			'https://tiles.example/{z}/{x}/{y}.png'
		);
		expect(resolveTileTemplate('http://tiles.example/{z}/{x}/{y}.png')).toBe(DEFAULT_OSM_TILE_URL);
		expect(resolveTileTemplate('https://tiles.example/{z}/{x}/{y}.png?key=secret')).toBe(
			DEFAULT_OSM_TILE_URL
		);
		expect(resolveTileTemplate('https://tiles.example/only-z/{z}.png')).toBe(DEFAULT_OSM_TILE_URL);
	});
});

import { describe, expect, it } from 'vitest';
import {
	TILE_SIZE,
	fitView,
	panCenter,
	pointPixel,
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
});

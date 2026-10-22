import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shiftHasPin, shiftMapTask } from '$lib/browse/visible-listings';
import { resolveListingPoint, taskToListingPlace } from '$lib/utils/maps/listing-markers';

describe('shift pins', () => {
	it('pins a named place and leaves a remote shift off the map', () => {
		expect(shiftHasPin('shift-1', 'Evening waiter', 'San Salvador')).toBe(true);
		expect(shiftHasPin('shift-2', 'Evening waiter', 'La Libertad, El Salvador')).toBe(true);
		expect(shiftHasPin('shift-3', 'Remote bookkeeping', 'Remote')).toBe(false);
		expect(shiftHasPin('shift-4', 'Remote bookkeeping', '')).toBe(false);
	});

	it('keeps a stored beach coordinate when the label also names La Libertad', () => {
		const point = resolveListingPoint(
			taskToListingPlace(
				shiftMapTask('shift-tunco', 'Waiter', 'El Tunco, La Libertad, El Salvador', {
					latitude: 13.49,
					longitude: -89.38
				})
			)
		);
		expect(point?.latitude).toBe(13.49);
		expect(point?.longitude).toBe(-89.38);
		expect(point?.source).toBe('stored');
	});
});

describe('browse board source', () => {
	it('shares one card list and map, with translated Poppins headings', () => {
		const board = readFileSync(resolve('src/lib/components/browse/BrowseBoard.svelte'), 'utf8');
		const en = readFileSync(resolve('static/locales/en/home.json'), 'utf8');
		const es = readFileSync(resolve('static/locales/es/home.json'), 'utf8');

		expect(board).toContain('TaskLocationMap');
		expect(board).toContain('md:block');
		expect(board).toContain('data-testid="browse-map"');
		expect(board).toContain("onOpenTask={kind === 'staff' ? openPin : undefined}");
		expect(board).toContain('isShiftPin');
		expect(board).toContain('TaskCard');
		expect(board).toContain('ServiceCard');
		expect(board).toContain('ShiftCard');
		expect(board).toContain('browse-heading');
		expect(board).toContain('dedupeListingsByEvent');
		expect(board).toContain('loadSharedCatalog');
		expect(board).toContain('selectSharedTasks');
		expect(board).toContain('formatTaskPrice');
		expect(board).toContain('navbar.browse_staff');
		expect(board).toContain('navbar.open_shifts');
		expect(board).toContain('navbar.workers');
		expect(en).toContain('"open_shifts": "Open shifts"');
		expect(en).toContain('"workers": "Workers"');
		expect(es).toContain('"open_shifts": "Turnos abiertos"');
		expect(es).toContain('"workers": "Personas"');
		expect(es).toContain('"browse_staff": "Personal temporal"');
	});
});

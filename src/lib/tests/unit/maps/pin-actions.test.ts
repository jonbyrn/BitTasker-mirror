import { describe, expect, it, vi } from 'vitest';
import { activateListingPin, browsePinTarget } from '$lib/utils/maps/pin-actions';

const shifts = [
	'test-meseroa-para-evento-1792679244',
	'test-recepcionista-temporal-1792679245',
	'test-ayudante-de-bodega-1792679246',
	'test-cajeroa-fin-de-semana-1792679247',
	'test-barista-1792679248'
];

describe('listing pin targets', () => {
	it('sends every shift pin to /shifts/<slug>', () => {
		for (const id of shifts) {
			expect(browsePinTarget('staff', id)).toBe(`/shifts/${id}`);
			expect(browsePinTarget('staff', id).startsWith('/tasks/')).toBe(false);
		}
	});

	it('keeps a posted task on the staff board at /tasks/<id>', () => {
		expect(browsePinTarget('staff', 'task-door')).toBe('/tasks/task-door');
		expect(browsePinTarget('tasks', 'repair-1')).toBe('/tasks/repair-1');
	});

	it('uses onOpenTask for a shift pin and does not open the task page', () => {
		const opened = vi.fn();
		const openTaskPage = vi.fn();
		activateListingPin({ id: shifts[1] }, opened, openTaskPage);
		expect(opened).toHaveBeenCalledWith({ id: shifts[1] });
		expect(openTaskPage).not.toHaveBeenCalled();
	});

	it('opens the task page when the map has no shift callback', () => {
		const openTaskPage = vi.fn();
		activateListingPin({ id: 'repair-1' }, undefined, openTaskPage);
		expect(openTaskPage).toHaveBeenCalledWith('repair-1');
	});
});

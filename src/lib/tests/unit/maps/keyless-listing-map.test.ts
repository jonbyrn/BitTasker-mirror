import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import type { Task } from '$lib/types/task';
import type { Service } from '$lib/types/service.d';

const goto = vi.hoisted(() => vi.fn());

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en')
}));

vi.mock('$app/navigation', () => ({ goto }));

import KeylessListingMap from '$lib/components/maps/KeylessListingMap.svelte';

function task(partial: Partial<Task> & Pick<Task, 'id'>): Task {
	return {
		title: partial.title ?? 'Task',
		taskType: partial.taskType ?? 'onsite',
		pickupLocation: partial.pickupLocation ?? null,
		dropOffLocation: partial.dropOffLocation ?? null,
		...partial
	} as Task;
}

describe('keyless listing map', () => {
	it('opens /tasks/<id> from a single task pin', async () => {
		const { container } = render(KeylessListingMap, {
			tasks: [
				task({
					id: 'task-1',
					title: 'Paint the wall',
					pickupLocation: {
						displayName: 'Medellín',
						latitude: 6.2476,
						longitude: -75.5658,
						zipCode: '',
						locationLoaded: true
					}
				})
			],
			height: '320px'
		});

		const pin = container.querySelector('[data-listing-pin]');
		expect(pin).not.toBeNull();
		expect(pin?.getAttribute('data-pin-count')).toBe('1');
		await fireEvent.click(pin as Element);
		expect(goto).toHaveBeenCalledWith('/tasks/task-1');
	});

	it('opens each nearby shift from its own pin', async () => {
		goto.mockClear();
		const opened = vi.fn();
		const benito = task({
			id: 'benito',
			title: 'Recepcionista temporal',
			pickupLocation: {
				displayName: 'San Benito, San Salvador, El Salvador',
				latitude: 13.6946,
				longitude: -89.2404,
				zipCode: '',
				locationLoaded: true
			}
		});
		const tecla = task({
			id: 'tecla',
			title: 'Ayudante de bodega',
			pickupLocation: {
				displayName: 'Santa Tecla, La Libertad, El Salvador',
				latitude: 13.6769,
				longitude: -89.2797,
				zipCode: '',
				locationLoaded: true
			}
		});
		const { container } = render(KeylessListingMap, {
			tasks: [benito, tecla],
			onOpenTask: opened,
			height: '512px'
		});
		const pins = [...container.querySelectorAll<HTMLElement>('[data-listing-pin]')];
		const benitoPin = pins.find((pin) => pin.dataset.pinId === 'benito');
		const teclaPin = pins.find((pin) => pin.dataset.pinId === 'tecla');
		expect(benitoPin).toBeTruthy();
		expect(teclaPin).toBeTruthy();
		const gap = Math.hypot(
			parseFloat(benitoPin?.style.left || '0') - parseFloat(teclaPin?.style.left || '0'),
			parseFloat(benitoPin?.style.top || '0') - parseFloat(teclaPin?.style.top || '0')
		);
		expect(gap).toBeGreaterThanOrEqual(80);
		await fireEvent.click(benitoPin as Element);
		expect(opened).toHaveBeenCalledWith(expect.objectContaining({ id: 'benito' }));
		await fireEvent.click(teclaPin as Element);
		expect(opened).toHaveBeenCalledWith(expect.objectContaining({ id: 'tecla' }));
		expect(goto).not.toHaveBeenCalled();
	});

	it('keeps a remote task with no place off the map and counts overlapping pins', () => {
		const { container } = render(KeylessListingMap, {
			tasks: [
				task({ id: 'remote', taskType: 'remote', title: 'Remote only' }),
				task({
					id: 'a',
					title: 'A',
					pickupLocation: {
						displayName: 'Bogotá',
						latitude: 4.711,
						longitude: -74.0721,
						zipCode: '',
						locationLoaded: true
					}
				}),
				task({
					id: 'b',
					title: 'B',
					pickupLocation: {
						displayName: 'Bogotá',
						latitude: 4.71105,
						longitude: -74.0721,
						zipCode: '',
						locationLoaded: true
					}
				})
			],
			height: '320px'
		});

		const pins = container.querySelectorAll('[data-listing-pin]');
		expect(pins).toHaveLength(1);
		expect(pins[0]?.textContent).toContain('2');
	});

	it('pins a city-only service and leaves a remote service with no place off the map', () => {
		const { container } = render(KeylessListingMap, {
			services: [
				{
					id: 'svc-city',
					uniqueId: 'svc-city',
					title: 'Surf lessons',
					serviceLocationTypes: ['tasker_location'],
					locationDetails: {
						taskerLocation: {
							locationDisplayName: 'La Libertad, El Salvador',
							serviceLocation: {
								displayName: 'La Libertad, El Salvador',
								latitude: null,
								longitude: null
							}
						}
					}
				},
				{
					id: 'svc-remote',
					uniqueId: 'svc-remote',
					title: 'Online edit',
					serviceLocationTypes: ['remote']
				}
			] as unknown as Service[],
			height: '320px'
		});

		const pins = container.querySelectorAll('[data-listing-pin]');
		expect(pins).toHaveLength(1);
		expect(pins[0]?.getAttribute('aria-label')).toContain('Surf lessons');
		expect(container.querySelector('[data-map-attribution]')?.textContent).toContain('Nominatim');
		expect(container.querySelector('[data-map-attribution]')?.textContent).toContain(
			'OpenStreetMap'
		);
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import ServiceLocation from '$lib/components/service/steps/ServiceLocation.svelte';

const hoisted = vi.hoisted(() => {
	function createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			set(nextValue: T) {
				value = nextValue;
				for (const subscriber of subscribers) {
					subscriber(value);
				}
			},
			update(updater: (currentValue: T) => T) {
				this.set(updater(value));
			},
			subscribe(subscriber: (nextValue: T) => void) {
				subscriber(value);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			}
		};
	}

	return {
		storeState: createStore({
			service: {
				serviceLocationTypes: [],
				locationDetails: undefined,
				pricing: {
					currency: 'USD'
				}
			}
		})
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/components/LocationPicker.svelte', async () => {
	const component = await import('./__mocks__/EnhancedLocationPicker.mock.svelte');
	return { default: component.default };
});

vi.mock('$lib/stores/service.store', () => ({
	serviceStore: {
		subscribe: hoisted.storeState.subscribe,
		updateService: (updates: Record<string, unknown>) => {
			hoisted.storeState.update(((state: Record<string, unknown>) => {
				const svc = state.service as Record<string, unknown> | undefined;
				return {
					...state,
					service: {
						...(svc ?? {}),
						...updates,
						locationDetails: {
							...((svc?.locationDetails as Record<string, unknown> | undefined) ?? {}),
							...((updates.locationDetails as Record<string, unknown> | undefined) ?? {})
						}
					}
				};
			}) as unknown as Parameters<typeof hoisted.storeState.update>[0]);
		}
	}
}));

describe('ServiceLocation', () => {
	beforeEach(() => {
		hoisted.storeState.set({
			service: {
				serviceLocationTypes: [],
				locationDetails: undefined,
				pricing: {
					currency: 'USD'
				}
			}
		});
	});

	function readStoreState() {
		let currentValue: {
			service: {
				serviceLocationTypes: string[];
				locationDetails?: {
					taskerLocation?: {
						serviceRadius?: number;
					};
					taskeeLocation?: {
						serviceRadius?: number;
					};
				};
			};
		} | null = null;
		const unsubscribe = hoisted.storeState.subscribe((value) => {
			currentValue = value;
		});
		unsubscribe();
		return currentValue;
	}

	it.skip('adds and updates the tasker-location service radius slider and map radius', async () => {
		const { getByRole, getByTestId, getAllByTestId } = render(ServiceLocation, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.click(
			getByRole('radio', { name: /dashboard\.services\.create\.location\.taskee_title/i })
		);

		await waitFor(() => expect(getByTestId('service-location-radius')).toHaveValue('5'));
		expect(getAllByTestId('mock-enhanced-location-picker-radius')[0]).toHaveTextContent('5');

		await fireEvent.input(getByTestId('service-location-radius'), {
			currentTarget: { value: '42' },
			target: { value: '42' }
		});

		await waitFor(() =>
			expect(
				(
					(
						(readStoreState() as unknown as Record<string, unknown>)?.service as unknown as Record<
							string,
							unknown
						>
					)?.taskeeLocation as unknown as Record<string, unknown>
				)?.serviceRadius
			).toBe(42)
		);
		await waitFor(() =>
			expect(getAllByTestId('mock-enhanced-location-picker-radius')[0]).toHaveTextContent('42')
		);
	});

	it('does not render a service radius slider for at-my-location services', async () => {
		const { getByRole, queryByTestId } = render(ServiceLocation, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.click(
			getByRole('radio', { name: /dashboard\.services\.create\.location\.tasker_title/i })
		);

		expect(queryByTestId('service-location-radius')).toBeNull();
	});

	it('does not render the legacy specific location label for taskee location', async () => {
		const { getByRole, queryByText } = render(ServiceLocation, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.click(
			getByRole('radio', { name: /dashboard\.services\.create\.location\.taskee_title/i })
		);

		expect(
			queryByText('dashboard.services.create.location.taskee_specific_location_label')
		).toBeNull();
	});
});

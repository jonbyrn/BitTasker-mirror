import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import LocationFilter from '$lib/components/filters/LocationFilter.svelte';

const mockSearchLocations = vi.fn();
const mockGetCurrentLocation = vi.fn();

vi.mock('$lib/api/services/location.service', () => ({
	default: {
		searchLocations: (...args: unknown[]) => mockSearchLocations(...args),
		getCurrentLocation: (...args: unknown[]) => mockGetCurrentLocation(...args)
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

describe('LocationFilter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('calls onLocationChange once when clearing location', async () => {
		const onLocationChange = vi.fn();
		render(LocationFilter, {
			props: {
				location: 'San Salvador',
				radius: 10,
				onLocationChange
			}
		});

		const clearButton = screen.getByRole('button', {
			name: 'dashboard.bids.components.filters.location.clear_location'
		});
		await fireEvent.click(clearButton);

		expect(onLocationChange).toHaveBeenCalledTimes(1);
		expect(onLocationChange).toHaveBeenCalledWith(undefined, 10);
	});

	it('ignores stale search responses and keeps latest results', async () => {
		const onLocationChange = vi.fn();
		let firstResolve: ((value: unknown) => void) | null = null;
		let secondResolve: ((value: unknown) => void) | null = null;

		mockSearchLocations
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						firstResolve = resolve;
					})
			)
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						secondResolve = resolve;
					})
			);

		render(LocationFilter, {
			props: {
				location: undefined,
				radius: 5,
				onLocationChange
			}
		});

		const input = screen.getByRole('textbox');
		await fireEvent.input(input, { target: { value: 'san' } });
		vi.advanceTimersByTime(300);
		await fireEvent.input(input, { target: { value: 'santa' } });
		vi.advanceTimersByTime(300);

		secondResolve?.({
			locations: [{ displayName: 'Santa Ana', latitude: 13.99, longitude: -89.55, zipCode: '2201' }]
		});
		await Promise.resolve();

		firstResolve?.({
			locations: [
				{ displayName: 'San Miguel', latitude: 13.48, longitude: -88.17, zipCode: '3301' }
			]
		});
		await Promise.resolve();

		await waitFor(() => {
			expect(screen.queryByText('Santa Ana')).toBeInTheDocument();
			expect(screen.queryByText('San Miguel')).not.toBeInTheDocument();
		});
	});
});

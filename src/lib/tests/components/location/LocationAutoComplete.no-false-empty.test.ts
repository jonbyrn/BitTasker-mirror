import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('@capacitor/geolocation', () => ({
	Geolocation: {
		checkPermissions: vi.fn().mockResolvedValue({ location: 'granted' }),
		requestPermissions: vi.fn().mockResolvedValue({ location: 'granted' }),
		getCurrentPosition: vi.fn().mockResolvedValue({ coords: { latitude: 0, longitude: 0 } })
	}
}));

vi.mock('@capacitor/screen-orientation', () => ({
	ScreenOrientation: {
		lock: vi.fn().mockResolvedValue(undefined),
		unlock: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: {
		isNativePlatform: () => false,
		isPluginAvailable: () => false
	}
}));

describe('LocationAutoComplete — no false "no places found" on focus', () => {
	let mockFetchSuggestions: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockFetchSuggestions = vi.fn().mockResolvedValue({ suggestions: [] });

		(window as any).google = {
			maps: {
				Map: vi.fn(),
				importLibrary: vi.fn().mockResolvedValue({
					AutocompleteSessionToken: vi.fn(),
					AutocompleteSuggestion: {
						fetchAutocompleteSuggestions: mockFetchSuggestions
					}
				}),
				event: { trigger: vi.fn() },
				Circle: vi.fn().mockReturnValue({
					setMap: vi.fn(),
					setRadius: vi.fn(),
					setCenter: vi.fn(),
					getBounds: vi.fn()
				}),
				MapTypeId: { ROADMAP: 'roadmap' }
			}
		};
	});

	afterEach(() => {
		delete (window as any).google;
		vi.restoreAllMocks();
	});

	it('does not show "no places found" when input is focused without typing', async () => {
		const { default: LocationAutoComplete } = await import(
			'$lib/components/LocationAutoComplete.svelte'
		);

		render(LocationAutoComplete, {
			props: {
				onLocationSelect: vi.fn()
			}
		});

		const input = screen.getByRole('textbox');
		await fireEvent.focus(input);

		const noResults = screen.queryByText('common.components.location_autocomplete.no_places_found');
		expect(noResults).toBeNull();
	});

	it('shows "no places found" only after a search returns empty results', async () => {
		const { default: LocationAutoComplete } = await import(
			'$lib/components/LocationAutoComplete.svelte'
		);

		render(LocationAutoComplete, {
			props: {
				onLocationSelect: vi.fn()
			}
		});

		const input = screen.getByRole('textbox');
		await fireEvent.input(input, { target: { value: 'xyznonexistent' } });

		await waitFor(() => {
			expect(mockFetchSuggestions).toHaveBeenCalled();
		});

		await waitFor(() => {
			const noResults = screen.queryByText('common.components.location_autocomplete.no_places_found');
			expect(noResults).not.toBeNull();
		});
	});

	it('hides dropdown when input is cleared after search', async () => {
		mockFetchSuggestions.mockResolvedValueOnce({
			suggestions: [
				{
					placePrediction: {
						placeId: 'abc',
						text: { text: 'Test Place', toString: () => 'Test Place' },
						toPlace: () => ({
							fetchFields: vi.fn().mockResolvedValue(undefined),
							displayName: 'Test Place',
							formattedAddress: '123 Test St',
							location: { lat: () => 10, lng: () => 20 },
							addressComponents: [],
							id: 'abc'
						})
					}
				}
			]
		});

		const { default: LocationAutoComplete } = await import(
			'$lib/components/LocationAutoComplete.svelte'
		);

		render(LocationAutoComplete, {
			props: {
				onLocationSelect: vi.fn()
			}
		});

		const input = screen.getByRole('textbox');

		// Type to get predictions
		await fireEvent.input(input, { target: { value: 'Test' } });
		await waitFor(() => {
			expect(screen.queryByText('Test Place')).not.toBeNull();
		});

		// Clear input — dropdown should close
		await fireEvent.input(input, { target: { value: '' } });
		await waitFor(() => {
			expect(screen.queryByText('Test Place')).toBeNull();
		});
	});
});

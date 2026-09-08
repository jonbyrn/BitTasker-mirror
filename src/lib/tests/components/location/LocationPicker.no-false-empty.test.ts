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

describe('LocationPicker — no false "no places found" on focus', () => {
	let mockFetchSuggestions: ReturnType<typeof vi.fn>;
	let mockMapInstance: any;

	beforeEach(() => {
		vi.stubEnv('VITE_E2E_TURNSTILE_BYPASS', 'false');
		vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
		mockFetchSuggestions = vi.fn().mockResolvedValue({ suggestions: [] });

		mockMapInstance = {
			addListener: vi.fn(),
			setCenter: vi.fn(),
			setZoom: vi.fn(),
			getZoom: vi.fn().mockReturnValue(12),
			fitBounds: vi.fn()
		};

		(window as any).google = {
			maps: {
				Map: vi.fn().mockReturnValue(mockMapInstance),
				importLibrary: vi.fn().mockImplementation((lib: string) => {
					if (lib === 'places') {
						return Promise.resolve({
							AutocompleteSessionToken: vi.fn(),
							AutocompleteSuggestion: {
								fetchAutocompleteSuggestions: mockFetchSuggestions
							}
						});
					}
					if (lib === 'marker') {
						return Promise.resolve({
							AdvancedMarkerElement: vi.fn().mockReturnValue({
								position: null,
								map: null,
								addListener: vi.fn()
							})
						});
					}
					if (lib === 'geocoding') {
						return Promise.resolve({
							Geocoder: vi.fn().mockReturnValue({
								geocode: vi.fn().mockResolvedValue({ results: [] })
							})
						});
					}
					return Promise.resolve({});
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

		// Mock document.head.appendChild to capture the Google Maps script tag
		// and immediately trigger onload
		vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
			if (node instanceof HTMLScriptElement) {
				setTimeout(() => {
					node.dispatchEvent(new Event('load'));
				}, 0);
			}
			return node;
		});
	});

	afterEach(() => {
		delete (window as any).google;
		vi.restoreAllMocks();
	});

	it('does not show "no places found" when input is focused without typing', async () => {
		const { default: LocationPicker } = await import('$lib/components/LocationPicker.svelte');

		render(LocationPicker, {
			props: {
				onLocationSelect: vi.fn()
			}
		});

		// Wait for map to initialize
		await waitFor(() => {
			expect(screen.getByRole('textbox')).toBeTruthy();
		});

		const input = screen.getByRole('textbox', { name: '' });
		await fireEvent.focus(input);

		// "No places found" should NOT appear on focus
		const noResults = screen.queryByText('task.location_picker.no_places_found');
		expect(noResults).toBeNull();
	});

	it('shows "no places found" only after a search returns empty results', async () => {
		const { default: LocationPicker } = await import('$lib/components/LocationPicker.svelte');

		render(LocationPicker, {
			props: {
				onLocationSelect: vi.fn()
			}
		});

		await waitFor(() => {
			expect(screen.getByRole('textbox')).toBeTruthy();
		});

		const input = screen.getByRole('textbox', { name: '' });
		await new Promise((resolve) => setTimeout(resolve, 600));

		// Type to trigger search
		await fireEvent.input(input, { target: { value: 'xyznonexistent' } });

		// Wait for debounced fetch
		await waitFor(() => {
			expect(mockFetchSuggestions).toHaveBeenCalled();
		});

		// Now "no places found" should appear
		await waitFor(() => {
			const noResults = screen.queryByText('task.location_picker.no_places_found');
			expect(noResults).not.toBeNull();
		});
	});
});

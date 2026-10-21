import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { hasPlaceOrCoordinates } from '$lib/utils/maps/geocode-on-save';
import type { Location } from '$lib/types/task';

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
		getCurrentPosition: vi.fn()
	}
}));

vi.mock('@capacitor/screen-orientation', () => ({
	ScreenOrientation: { lock: vi.fn(), unlock: vi.fn() }
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false }
}));

describe('LocationPicker map fallback', () => {
	beforeEach(() => {
		vi.stubEnv('VITE_E2E_TURNSTILE_BYPASS', 'false');
		vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'test-key');
		delete (window as unknown as { google?: unknown }).google;
		vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
			if (node instanceof HTMLScriptElement) {
				queueMicrotask(() => {
					if (typeof node.onerror === 'function') node.onerror(new Event('error'));
				});
			}
			return node;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it('lets a department or a typed address satisfy the location when Maps fails', async () => {
		const onLocationSelect = vi.fn();
		const { default: LocationPicker } = await import('$lib/components/LocationPicker.svelte');
		render(LocationPicker, { props: { onLocationSelect } });

		await waitFor(() => {
			expect(screen.getByTestId('location-department')).toBeTruthy();
		});

		await waitFor(() => {
			expect(onLocationSelect).toHaveBeenCalled();
		});
		const fallback = onLocationSelect.mock.calls.at(-1)?.[0] as Location;
		expect(fallback.displayName).toBe('San Salvador, San Salvador, El Salvador');
		expect(hasPlaceOrCoordinates(fallback)).toBe(true);

		const select = screen.getByTestId('location-department') as HTMLSelectElement;
		await fireEvent.change(select, { target: { value: 'Santa Ana|Santa Ana' } });
		const picked = onLocationSelect.mock.calls.at(-1)?.[0] as Location;
		expect(picked.displayName).toContain('Santa Ana');
		expect(picked.latitude).toBeCloseTo(13.9942);
		expect(hasPlaceOrCoordinates(picked)).toBe(true);

		const input = screen.getByRole('textbox');
		await fireEvent.input(input, { target: { value: 'Calle Arce 123' } });
		await waitFor(() => {
			const typed = onLocationSelect.mock.calls.at(-1)?.[0] as Location;
			expect(typed.displayName).toBe('Calle Arce 123');
			expect(typed.locationLoaded).toBe(true);
			expect(hasPlaceOrCoordinates(typed)).toBe(true);
		});
	});
});

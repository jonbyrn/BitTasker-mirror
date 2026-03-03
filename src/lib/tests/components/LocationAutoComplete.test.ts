import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

function setupGooglePlacesMock() {
	const resolvers: Array<(value: unknown) => void> = [];
	const fetchAutocompleteSuggestions = vi.fn(
		() =>
			new Promise((resolve) => {
				resolvers.push(resolve);
			})
	);

	(globalThis as unknown as { google: unknown }).google = {
		maps: {
			importLibrary: vi.fn(async () => ({
				AutocompleteSessionToken: class {},
				AutocompleteSuggestion: {
					fetchAutocompleteSuggestions
				}
			}))
		}
	};

	return {
		fetchAutocompleteSuggestions,
		resolveAt: (index: number, value: unknown) => {
			const resolve = resolvers[index];
			resolve?.(value);
		}
	};
}

describe('LocationAutoComplete', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('clears stale options when input is emptied', async () => {
		const { resolveAt } = setupGooglePlacesMock();
		render(LocationAutoComplete, {
			props: {
				showMap: false,
				onLocationSelect: vi.fn()
			}
		});

		const input = screen.getByRole('textbox');
		await fireEvent.input(input, { target: { value: 'san' } });
		await vi.advanceTimersByTimeAsync(300);
		resolveAt(0, {
			suggestions: [
				{
					placePrediction: {
						text: { text: 'San Salvador', toString: () => 'San Salvador' },
						placeId: '1',
						toPlace: () => ({ fetchFields: vi.fn(), location: { lat: () => 1, lng: () => 2 } })
					}
				}
			]
		});
		await Promise.resolve();
		await waitFor(() => expect(screen.queryByText('San Salvador')).toBeInTheDocument());

		await fireEvent.input(input, { target: { value: '' } });
		await vi.advanceTimersByTimeAsync(300);
		await waitFor(() => expect(screen.queryByText('San Salvador')).not.toBeInTheDocument());
	});

	it('keeps latest prediction results when requests resolve out of order', async () => {
		const { resolveAt } = setupGooglePlacesMock();
		render(LocationAutoComplete, {
			props: {
				showMap: false,
				onLocationSelect: vi.fn()
			}
		});

		const input = screen.getByRole('textbox');
		await fireEvent.input(input, { target: { value: 'san' } });
		await vi.advanceTimersByTimeAsync(300);
		await fireEvent.input(input, { target: { value: 'santa' } });
		await vi.advanceTimersByTimeAsync(300);

		// Resolve second request first
		resolveAt(1, {
			suggestions: [
				{
					placePrediction: {
						text: { text: 'Santa Ana', toString: () => 'Santa Ana' },
						placeId: '2',
						toPlace: () => ({ fetchFields: vi.fn(), location: { lat: () => 1, lng: () => 2 } })
					}
				}
			]
		});
		await Promise.resolve();

		// Resolve stale first request last
		resolveAt(0, {
			suggestions: [
				{
					placePrediction: {
						text: { text: 'San Miguel', toString: () => 'San Miguel' },
						placeId: '3',
						toPlace: () => ({ fetchFields: vi.fn(), location: { lat: () => 1, lng: () => 2 } })
					}
				}
			]
		});
		await Promise.resolve();

		await waitFor(() => {
			expect(screen.queryByText('Santa Ana')).toBeInTheDocument();
			expect(screen.queryByText('San Miguel')).not.toBeInTheDocument();
		});
	});
});

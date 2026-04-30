import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import LocationDetailsCard from '$lib/components/location/LocationDetailsCard.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'common.location.address') {
				return 'Address';
			}
			if (key === 'common.location.approximate_short') {
				return 'Approx.';
			}
			return key;
		})
	};
});

vi.mock('$lib/utils/location/maps', () => ({
	formatLocationAddress: vi.fn((location: { displayName?: string }) => location.displayName || ''),
	generateGoogleMapsDirectionsLink: vi.fn(() => 'https://maps.example.test')
}));

describe('LocationDetailsCard approximate public location note', () => {
	it('shows a brief note when the displayed address is approximate', () => {
		render(LocationDetailsCard, {
			location: {
				displayName: 'Denver, CO, US',
				locationLoaded: true,
				zipCode: ''
			} as never
		});

		expect(screen.getByText('Address')).toBeInTheDocument();
		expect(screen.getByText('Denver, CO, US')).toBeInTheDocument();
		expect(screen.getByText(/\(Approx\.\)/)).toBeInTheDocument();
	});
});

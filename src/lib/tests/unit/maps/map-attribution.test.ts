import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import MapAttribution from '$lib/components/maps/MapAttribution.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return { t: readable((key: string) => key), locale: readable('en') };
});

describe('map attribution', () => {
	it('shows OpenStreetMap and Nominatim credits', () => {
		const { container } = render(MapAttribution);
		const attribution = container.querySelector('[data-map-attribution]');
		expect(attribution).not.toBeNull();
		expect(attribution?.textContent).toContain('OpenStreetMap');
		expect(attribution?.textContent).toContain('Nominatim');
		const links = attribution?.querySelectorAll('a') ?? [];
		expect([...links].map((link) => link.getAttribute('href'))).toEqual([
			'https://www.openstreetmap.org/copyright',
			'https://nominatim.org/'
		]);
	});
});

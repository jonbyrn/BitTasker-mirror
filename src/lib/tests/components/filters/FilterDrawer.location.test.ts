import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import FilterDrawer from '$lib/components/filters/FilterDrawer.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en'),
		locales: readable(['en']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/components/listing/UnifiedFilterDrawer.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/UnifiedFilterDrawerStub.svelte')).default
}));

vi.mock('$lib/components/LocationAutoComplete.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/LocationAutoCompleteStub.svelte')).default
}));

vi.mock('$lib/components/CategoryMultiselect.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/CategoryMultiselectStub.svelte')).default
}));

vi.mock('$lib/components/SkillsMultiselect.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/SkillsMultiselectStub.svelte')).default
}));

vi.mock('$lib/components/filters/PriceRangeSlider.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/PriceRangeSliderStub.svelte')).default
}));

vi.mock('$lib/components/filters/AvailabilityFilter.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/AvailabilityFilterStub.svelte')).default
}));

describe('FilterDrawer location state', () => {
	it('preserves location coordinates when reopened and applied without reselection', async () => {
		const onApply = vi.fn();
		const onClose = vi.fn();

		render(FilterDrawer, {
			isOpen: true,
			onApply,
			onClose,
			initialFilters: {
				location: 'Austin, TX, USA',
				locationCoords: {
					latitude: 30.2672,
					longitude: -97.7431
				},
				radius: 2,
				categories: [],
				skills: [],
				budget: {}
			}
		});

		await fireEvent.click(screen.getByTestId('drawer-apply'));

		expect(onApply).toHaveBeenCalledWith(
			expect.objectContaining({
				location: 'Austin, TX, USA',
				locationCoords: {
					latitude: 30.2672,
					longitude: -97.7431
				}
			})
		);
	});
});

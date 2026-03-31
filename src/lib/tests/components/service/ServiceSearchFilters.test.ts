import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import ServiceSearchFilters from '$lib/components/service/ServiceSearchFilters.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
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

describe('ServiceSearchFilters', () => {
	it('preserves location coordinates when reopened and applied without reselection', async () => {
		const onApply = vi.fn();
		const onClose = vi.fn();

		render(ServiceSearchFilters, {
			isOpen: true,
			onApply,
			onClose,
			initialFilters: {
				location: 'Austin, TX, USA',
				locationCoords: {
					latitude: 30.2672,
					longitude: -97.7431
				},
				radius: 10,
				categories: [],
				skills: [],
				serviceLocationTypes: []
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
		expect(onClose).toHaveBeenCalled();
	});
});

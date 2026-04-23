import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import UnifiedFilterDrawer from '$lib/components/listing/UnifiedFilterDrawer.svelte';

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key)
}));

vi.mock('$app/environment', () => ({
	browser: true,
	dev: false
}));

vi.mock('$lib/stores/scrollContainer.store', () => ({
	appScrollContainer: readable(null)
}));

describe('UnifiedFilterDrawer', () => {
	it('renders the shared title, slot content, and action badge', () => {
		const { getByText } = render(UnifiedFilterDrawer, {
			isOpen: true,
			title: 'Filters',
			onClose: vi.fn(),
			onClear: vi.fn(),
			onApply: vi.fn(),
			clearLabel: 'Clear Filters',
			applyLabel: 'Apply',
			activeFilterCount: 3
		});

		expect(getByText('Filters')).toBeTruthy();
		expect(getByText('Clear Filters')).toBeTruthy();
		expect(getByText('Apply')).toBeTruthy();
	});

	it('wires clear and apply actions through the shared footer', async () => {
		const onClear = vi.fn();
		const onApply = vi.fn();
		const { getByRole } = render(UnifiedFilterDrawer, {
			isOpen: true,
			title: 'Filters',
			onClose: vi.fn(),
			onClear,
			onApply,
			clearLabel: 'Clear Filters',
			applyLabel: 'Apply'
		});

		await fireEvent.click(getByRole('button', { name: 'Clear Filters' }));
		await fireEvent.click(getByRole('button', { name: 'Apply' }));

		expect(onClear).toHaveBeenCalledTimes(1);
		expect(onApply).toHaveBeenCalledTimes(1);
	});
});

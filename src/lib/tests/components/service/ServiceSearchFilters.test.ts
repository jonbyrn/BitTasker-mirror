import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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

	describe('Price Range Validation', () => {
		it('shows error when min-price exceeds max-price', async () => {
			const onApply = vi.fn();
			const onClose = vi.fn();

			render(ServiceSearchFilters, {
				isOpen: true,
				onApply,
				onClose,
				initialFilters: {}
			});

			const minPriceInput = screen.getByLabelText(/min.*price/i) as HTMLInputElement;
			const maxPriceInput = screen.getByLabelText(/max.*price/i) as HTMLInputElement;

			await fireEvent.input(minPriceInput, { target: { value: '500' } });
			await fireEvent.input(maxPriceInput, { target: { value: '100' } });
			await fireEvent.blur(maxPriceInput);

			await waitFor(() => {
				const errorEl = screen.getByTestId('price-error');
				expect(errorEl).toBeInTheDocument();
			});
		});

		it('min-price input has aria-invalid when validation fails', async () => {
			const onApply = vi.fn();
			const onClose = vi.fn();

			render(ServiceSearchFilters, {
				isOpen: true,
				onApply,
				onClose,
				initialFilters: {}
			});

			const minPriceInput = screen.getByLabelText(/min.*price/i) as HTMLInputElement;
			const maxPriceInput = screen.getByLabelText(/max.*price/i) as HTMLInputElement;

			await fireEvent.input(minPriceInput, { target: { value: '500' } });
			await fireEvent.input(maxPriceInput, { target: { value: '100' } });
			await fireEvent.blur(maxPriceInput);

			await waitFor(() => {
				expect(minPriceInput).toHaveAttribute('aria-invalid', 'true');
			});
		});

		it('min-price input has aria-describedby linking to error message', async () => {
			const onApply = vi.fn();
			const onClose = vi.fn();

			render(ServiceSearchFilters, {
				isOpen: true,
				onApply,
				onClose,
				initialFilters: {}
			});

			const minPriceInput = screen.getByLabelText(/min.*price/i) as HTMLInputElement;

			await fireEvent.input(minPriceInput, { target: { value: '500' } });
			await fireEvent.input(screen.getByLabelText(/max.*price/i), { target: { value: '100' } });
			await fireEvent.blur(screen.getByLabelText(/max.*price/i));

			await waitFor(() => {
				expect(minPriceInput).toHaveAttribute('aria-describedby', 'min-price-error');
			});
		});
	});

	describe('Collapse ARIA', () => {
		it('skills collapse checkbox has aria-expanded reflecting state', async () => {
			const onApply = vi.fn();
			const onClose = vi.fn();

			render(ServiceSearchFilters, {
				isOpen: true,
				onApply,
				onClose,
				initialFilters: {}
			});

			const checkbox = screen.getByRole('checkbox', { name: /toggle_skills/i });
			expect(checkbox).toHaveAttribute('aria-expanded', 'false');

			await fireEvent.click(checkbox);

			await waitFor(() => {
				expect(checkbox).toHaveAttribute('aria-expanded', 'true');
			});
		});

		it('price range collapse checkbox has aria-expanded reflecting state', async () => {
			const onApply = vi.fn();
			const onClose = vi.fn();

			render(ServiceSearchFilters, {
				isOpen: true,
				onApply,
				onClose,
				initialFilters: {}
			});

			const checkbox = screen.getByRole('checkbox', { name: /toggle_price_range/i });
			expect(checkbox).toHaveAttribute('aria-expanded', 'false');

			await fireEvent.click(checkbox);

			await waitFor(() => {
				expect(checkbox).toHaveAttribute('aria-expanded', 'true');
			});
		});
	});
});

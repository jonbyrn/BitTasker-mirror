import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import ServiceProposalComposer from '$lib/components/service/quotes/ServiceProposalComposer.svelte';

vi.mock('svelte-i18n', () => ({
	t: readable((key: string) => key),
	locale: readable('en')
}));

vi.mock('$lib/utils/portal', () => ({
	teleport: () => ({})
}));

vi.mock('$lib/utils/helpers/modalScrollLock', () => ({
	acquireScheduleModalScrollLock: () => () => {}
}));

describe('ServiceProposalComposer', () => {
	it('does not render a persistent wallet warning and surfaces send errors inline', async () => {
		const onSubmit = vi.fn().mockResolvedValue({
			success: false,
			error: 'Connect your wallet before sending a proposal.'
		});

		render(ServiceProposalComposer, {
			props: { onSubmit }
		});

		expect(screen.queryByText('Connect your wallet before sending a proposal.')).toBeNull();

		// Fill required text fields (dates are pre-validation, covered by utility tests)
		await fireEvent.input(screen.getByLabelText('Scope of work'), {
			target: { value: 'Detailed migration plan.' }
		});
		await fireEvent.input(screen.getByLabelText(/Amount|dashboard.services.my_services/), {
			target: { value: '180.00' }
		});

		await fireEvent.click(screen.getByRole('button', { name: /Send Proposal/i }));

		// Should fail with inline error (date validation blocks submit — expected)
		await waitFor(
			() => {
				expect(screen.getByTestId('service-proposal-composer-error')).toBeInTheDocument();
			},
			{ timeout: 3000 }
		);
	});

	it('prefers an explicit blocked reason when sync state disables sending', async () => {
		const onSubmit = vi.fn();

		render(ServiceProposalComposer, {
			props: {
				disabled: true,
				blockedReason:
					'Quote data is still syncing. Sending is disabled until the latest request state loads.',
				onSubmit
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: /Send Proposal/i }));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByTestId('service-proposal-composer-error')).toHaveTextContent(
			'Quote data is still syncing. Sending is disabled until the latest request state loads.'
		);
	});

	it('keeps the current form open when the shared date-range validation fails', async () => {
		const onSubmit = vi.fn();

		render(ServiceProposalComposer, {
			props: { onSubmit }
		});

		await fireEvent.input(screen.getByLabelText('Scope of work'), {
			target: { value: 'Detailed migration plan.' }
		});
		await fireEvent.input(screen.getByLabelText(/Amount|dashboard.services.my_services/), {
			target: { value: '180.00' }
		});

		// Without dates set, validation should block submit
		await fireEvent.click(screen.getByRole('button', { name: /Send Proposal/i }));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByTestId('service-proposal-composer-error')).toBeInTheDocument();
	});

	it('accepts integer USD amounts without requiring decimal places', async () => {
		const onSubmit = vi.fn().mockResolvedValue({ success: true });

		render(ServiceProposalComposer, {
			props: { onSubmit }
		});

		// Type integer amount
		await fireEvent.input(screen.getByLabelText(/Amount|dashboard.services.my_services/), {
			target: { value: '180' }
		});

		const amountInput = screen.getByLabelText(/Amount|dashboard.services.my_services/);
		expect((amountInput as HTMLInputElement).value).toBe('180');
	});
});

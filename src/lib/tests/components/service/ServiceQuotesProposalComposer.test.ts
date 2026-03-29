import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ServiceProposalComposer from '$lib/components/service/quotes/ServiceProposalComposer.svelte';

describe('ServiceProposalComposer', () => {
	it('does not render a persistent wallet warning and surfaces send errors inline', async () => {
		const onSubmit = vi.fn().mockResolvedValue({
			success: false,
			error: 'Connect your wallet before sending a proposal.'
		});

		render(ServiceProposalComposer, {
			props: {
				onSubmit
			}
		});

		expect(screen.queryByText('Connect your wallet before sending a proposal.')).toBeNull();

		await fireEvent.input(screen.getByLabelText('Scope of work'), {
			target: { value: 'Detailed migration plan.' }
		});
		await fireEvent.input(screen.getByLabelText('Amount (USD)'), {
			target: { value: '180.00' }
		});
		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-03-20T09:30' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-03-22T18:45' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Send Proposal' }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(screen.getByTestId('service-proposal-composer-error')).toHaveTextContent(
			'Connect your wallet before sending a proposal.'
		);
	});

	it('keeps form values after a failed submit and resets on success', async () => {
		const onSubmit = vi
			.fn()
			.mockResolvedValueOnce({ success: false, error: 'Unable to publish proposal' })
			.mockResolvedValueOnce({ success: true });

		render(ServiceProposalComposer, {
			props: {
				onSubmit
			}
		});

		const scope = screen.getByLabelText('Scope of work');
		const amount = screen.getByLabelText('Amount (USD)');
		const start = screen.getByLabelText('Start Date');
		const end = screen.getByLabelText('End Date');

		await fireEvent.input(scope, {
			target: { value: 'Detailed migration plan.' }
		});
		await fireEvent.input(amount, {
			target: { value: '180.00' }
		});
		await fireEvent.input(start, {
			target: { value: '2026-03-20T09:30' }
		});
		await fireEvent.input(end, {
			target: { value: '2026-03-22T18:45' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Send Proposal' }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(screen.getByTestId('service-proposal-composer-error')).toHaveTextContent(
			'Unable to publish proposal'
		);
		expect(scope).toHaveValue('Detailed migration plan.');
		expect(amount).toHaveValue('180.00');

		await fireEvent.click(screen.getByRole('button', { name: 'Send Proposal' }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
		expect(screen.queryByTestId('service-proposal-composer-error')).toBeNull();
		expect(scope).toHaveValue('');
		expect(amount).toHaveValue('');
		expect(start).toHaveValue('');
		expect(end).toHaveValue('');
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

		await fireEvent.click(screen.getByRole('button', { name: 'Send Proposal' }));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByTestId('service-proposal-composer-error')).toHaveTextContent(
			'Quote data is still syncing. Sending is disabled until the latest request state loads.'
		);
	});

	it('keeps the current form open when the shared date-range validation fails', async () => {
		const onSubmit = vi.fn();

		render(ServiceProposalComposer, {
			props: {
				onSubmit
			}
		});

		await fireEvent.input(screen.getByLabelText('Scope of work'), {
			target: { value: 'Detailed migration plan.' }
		});
		await fireEvent.input(screen.getByLabelText('Amount (USD)'), {
			target: { value: '180.00' }
		});
		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-03-22T18:45' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-03-20T09:30' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Send Proposal' }));

		expect(onSubmit).not.toHaveBeenCalled();
		expect(screen.getByTestId('service-proposal-composer-error')).toHaveTextContent(
			'End time must be after start time.'
		);
	});

	it('accepts integer USD amounts without requiring decimal places', async () => {
		const onSubmit = vi.fn().mockResolvedValue({ success: true });

		render(ServiceProposalComposer, {
			props: {
				onSubmit
			}
		});

		await fireEvent.input(screen.getByLabelText('Scope of work'), {
			target: { value: 'Detailed migration plan.' }
		});
		await fireEvent.input(screen.getByLabelText('Amount (USD)'), {
			target: { value: '180' }
		});
		await fireEvent.input(screen.getByLabelText('Start Date'), {
			target: { value: '2026-03-20T09:30' }
		});
		await fireEvent.input(screen.getByLabelText('End Date'), {
			target: { value: '2026-03-22T18:45' }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Send Proposal' }));

		await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
		expect(onSubmit).toHaveBeenCalledWith(
			expect.objectContaining({
				amountUsdt: '180'
			})
		);
	});
});

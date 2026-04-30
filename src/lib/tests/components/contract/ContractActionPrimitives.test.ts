import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import ContractActionBar from '$lib/components/contracts/actions/ContractActionBar.svelte';
import AcceptContractButton from '$lib/components/contracts/actions/AcceptContractButton.svelte';
import CancelContractButton from '$lib/components/contracts/actions/CancelContractButton.svelte';
import CompleteContractButton from '$lib/components/contracts/actions/CompleteContractButton.svelte';
import DisputeContractButton from '$lib/components/contracts/actions/DisputeContractButton.svelte';
import ResolutionProposalButton from '$lib/components/contracts/actions/ResolutionProposalButton.svelte';

describe('contract action primitives', () => {
	it('renders the shared action bar container and its children', () => {
		render(ContractActionBar, {
			containerClass: 'flex gap-4'
		});

		const container = document.querySelector('.flex.gap-4');
		expect(container).toBeTruthy();
		expect(container?.children.length).toBe(0);
	});

	it('renders shared contract buttons with override labels and click handlers', async () => {
		const accept = vi.fn();
		const cancel = vi.fn();
		const complete = vi.fn();
		const dispute = vi.fn();
		const resolution = vi.fn();

		render(AcceptContractButton, {
			label: 'Accept Service',
			onclick: accept
		});
		render(CancelContractButton, {
			label: 'Cancel Contract',
			onclick: cancel
		});
		render(CompleteContractButton, {
			label: 'Mark Service Complete',
			onclick: complete
		});
		render(DisputeContractButton, {
			label: 'Dispute Service',
			onclick: dispute
		});
		render(ResolutionProposalButton, {
			label: 'Counter Proposal (1/2)',
			onclick: resolution
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Accept Service' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel Contract' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Mark Service Complete' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Dispute Service' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Counter Proposal (1/2)' }));

		expect(accept).toHaveBeenCalledTimes(1);
		expect(cancel).toHaveBeenCalledTimes(1);
		expect(complete).toHaveBeenCalledTimes(1);
		expect(dispute).toHaveBeenCalledTimes(1);
		expect(resolution).toHaveBeenCalledTimes(1);
	});

	it('renders the complete action with success styling', () => {
		render(CompleteContractButton, {
			label: 'Mark Service Complete'
		});

		expect(screen.getByRole('button', { name: 'Mark Service Complete' }).className).toContain(
			'btn-success'
		);
	});

	it('shows loading state while preserving the shared button labels', () => {
		render(AcceptContractButton, {
			label: 'Accept Service',
			loading: true,
			disabled: true
		});

		const button = screen.getByRole('button', { name: 'Accept Service' }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
		expect(button.querySelector('.loading')).toBeTruthy();
	});
});

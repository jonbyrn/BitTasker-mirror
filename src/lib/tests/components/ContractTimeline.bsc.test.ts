import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ContractTimeline from '$lib/components/contracts/ContractTimeline.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	return {
		t: readable((key: string) => {
			if (key === 'dashboard.contracts.timeline.view_transaction') {
				return 'View transaction';
			}

			return key;
		}),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/helpers/dateFormatter', () => ({
	formatStandardDateTime: vi.fn(() => 'formatted-date')
}));

vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getActionDescription: vi.fn(() => 'dashboard.contracts.status.dispute_resolution_proposed')
}));

describe('ContractTimeline BSC fail-closed rendering', () => {
	const statusEvents = [
		{
			id: 'status-1',
			pubkey: 'freelancer-pubkey',
			created_at: 1_700_000_100,
			tags: [],
			content: {
				contractEventId: 'contract-event-1',
				escrowId: 'escrow-1',
				action: EscrowStatus.DisputeResolutionProposed,
				timestamp: 1_700_000_100_000,
				type: 'contract-status' as const,
				transactionHash: '0xabc123',
				proposedClientAmount: '5',
				proposedFreelancerAmount: '7'
			}
		}
	];

	it('hides explorer links and labels split amounts generically when rail context is missing', () => {
		render(ContractTimeline, {
			statusEvents,
			contractPubkey: 'client-pubkey',
			paymentAsset: 'RBTC'
		});

		expect(screen.queryByRole('link', { name: /View transaction/i })).not.toBeInTheDocument();
		expect(screen.getByText(/dashboard\.client:\s*5 Escrow amount/)).toBeInTheDocument();
		expect(screen.getByText(/dashboard\.freelancer:\s*7 Escrow amount/)).toBeInTheDocument();
	});

	it('renders the BSC explorer target and token units when the BSC rail is explicit', () => {
		render(ContractTimeline, {
			statusEvents,
			contractPubkey: 'client-pubkey',
			paymentAsset: 'USDT',
			paymentNetwork: 'bsc-testnet'
		});

		expect(screen.getByRole('link', { name: /View transaction/i })).toHaveAttribute(
			'href',
			'https://testnet.bscscan.com/tx/0xabc123'
		);
		expect(screen.getByText(/dashboard\.client:\s*5 USDT/)).toBeInTheDocument();
		expect(screen.getByText(/dashboard\.freelancer:\s*7 USDT/)).toBeInTheDocument();
	});

	it('infers USDT on BSC from legacy network-only timeline context', () => {
		render(ContractTimeline, {
			statusEvents,
			contractPubkey: 'client-pubkey',
			paymentNetwork: 'bsc-testnet'
		});

		expect(screen.getByRole('link', { name: /View transaction/i })).toHaveAttribute(
			'href',
			'https://testnet.bscscan.com/tx/0xabc123'
		);
		expect(screen.getByText(/dashboard\.client:\s*5 USDT/)).toBeInTheDocument();
		expect(screen.getByText(/dashboard\.freelancer:\s*7 USDT/)).toBeInTheDocument();
		expect(screen.queryByText(/BSC escrow/)).not.toBeInTheDocument();
	});
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

import ContractTimeline from '$lib/components/contracts/ContractTimeline.svelte';

const { mockedEscrowStatus } = vi.hoisted(() => ({
	mockedEscrowStatus: {
		Funded: 0,
		InDispute: 1,
		DisputeResolved: 2,
		DisputeUnresolved: 3,
		Completed: 4,
		Cancelled: 5,
		PendingCompletion: 6,
		InProgress: 7,
		PendingAcceptance: 8,
		PendingDispute: 9,
		FundsReleased: 10,
		PendingCancellation: 11,
		DisputeResolutionProposed: 12
	} as const
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/helpers/dateFormatter', () => ({
	formatStandardDateTime: vi.fn(() => '2026-03-13 00:00')
}));

vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getActionDescription: vi.fn(() => 'dashboard.contracts.status.in_progress')
}));

vi.mock('$lib/utils/escrow', () => ({
	EscrowStatus: mockedEscrowStatus
}));

describe('ContractTimeline', () => {
	it('fails closed and hides transaction links when the payment network is missing', () => {
		render(ContractTimeline, {
			props: {
				statusEvents: [],
				contractPubkey: 'client-pubkey',
				contractCreatedAt: 1,
				contractCreatorPubkey: 'client-pubkey',
				contractFundingTransactionHash: '0xabc123',
				paymentAsset: 'RBTC'
			}
		});

		expect(screen.queryByRole('link')).not.toBeInTheDocument();
	});

	it('uses a generic split label when the rail is missing and restores BSC explorer links when explicit', () => {
		const proposedSplit = [
			{
				id: 'status-1',
				pubkey: 'freelancer-pubkey',
				created_at: 1,
				kind: 31006,
				tags: [],
				sig: 'sig',
				content: {
					action: mockedEscrowStatus.DisputeResolutionProposed,
					timestamp: Date.now(),
					type: 'contract-status',
					proposedClientAmount: '10',
					proposedFreelancerAmount: '5',
					transactionHash: '0xdef456'
				}
			}
		];

		const { unmount } = render(ContractTimeline, {
			props: {
				statusEvents: proposedSplit,
				contractPubkey: 'client-pubkey'
			}
		});

		expect(
			screen.getByText((content) => content.includes('dashboard.client: 10 Escrow amount'))
		).toBeInTheDocument();
		expect(screen.queryByRole('link')).not.toBeInTheDocument();

		unmount();

		render(ContractTimeline, {
			props: {
				statusEvents: [],
				contractPubkey: 'client-pubkey',
				contractCreatedAt: 1,
				contractCreatorPubkey: 'client-pubkey',
				contractFundingTransactionHash: '0xdef456',
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			}
		});

		expect(screen.getByRole('link').getAttribute('href')).toBe(
			'https://testnet.bscscan.com/tx/0xdef456'
		);
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import ContractDrawer from '$lib/components/contracts/ContractDrawer.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

const { contractStoreState, getContractKey } = vi.hoisted(() => {
	let value = {
		contract: null as any,
		contracts: [] as any[],
		isDrawerOpen: true,
		isResolutionFormOpen: false
	};
	const subscribers = new Set<(nextValue: typeof value) => void>();
	const state = {
		subscribe(run: (nextValue: typeof value) => void) {
			run(value);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		set(nextValue: typeof value) {
			value = nextValue;
			subscribers.forEach((run) => run(value));
		},
		update(updater: (nextValue: typeof value) => typeof value) {
			state.set(updater(value));
		}
	};

	return {
		contractStoreState: state,
		getContractKey: vi.fn((contract: any, key: string) => {
			if (key === 'otherPartyNpub') return 'npub1counterparty';
			if (key === 'clientPubkey') return 'npub1client';
			if (key === 'amount') return contract.contractEvent.content.amount;
			if (key === 'taskTitle' || key === 'contextTitle') return contract.contractEvent.content.contextTitle;
			if (key === 'taskDescription' || key === 'contextDescription') {
				return contract.contractEvent.content.contextDescription;
			}
			if (key === 'estimatedStartTime') return contract.contractEvent.content.estimatedStartTime;
			if (key === 'estimatedCompletionTime') {
				return contract.contractEvent.content.estimatedCompletionTime;
			}
			if (key === 'escrowId') return contract.escrowData.id;
			return contract.contractEvent.content[key];
		})
	};
});

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		subscribe: contractStoreState.subscribe,
		set: contractStoreState.set,
		update: contractStoreState.update,
		getContractKey
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="drawer-deadline">Deadline</div>'
	})
}));

vi.mock('$lib/components/shared/UsdSatsDisplay.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="drawer-price">USD/Sats</div>'
	})
}));

vi.mock('$lib/components/contracts/ContractTimeline.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="drawer-timeline">Timeline</div>'
	})
}));

vi.mock('$lib/components/contracts/ContractActions.svelte', () => ({
	default: () => ({
		$$render: (_result: unknown, props: { contract: any }) =>
			`<div data-testid="drawer-actions">${
				props.contract.contractEvent.content.contextType === 'service'
					? 'Accept Service'
					: 'dashboard.contracts.actions.accept_work'
			}</div>`
	})
}));

vi.mock('$lib/components/Gallery.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="drawer-gallery">Gallery</div>'
	})
}));

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: () => ({
		$$render: () => '<div data-testid="drawer-user">User</div>'
	})
}));

vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getStatusColorClass: vi.fn(() => 'badge-neutral'),
	getStatusTranslationKey: vi.fn(() => 'dashboard.contracts.status.funded')
}));

function buildServiceContract() {
	return {
		escrowData: {
			id: 'svc-escrow_123',
			status: EscrowStatus.Funded
		},
		status: EscrowStatus.Funded,
		isClient: true,
		isPending: false,
		blockchainStatus: EscrowStatus.Funded,
		statusEvents: [],
		completionAttachments: [],
		permissions: {
			canComplete: false,
			canAccept: true,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		},
		contractEvent: {
			id: 'service-contract-event-1',
			pubkey: 'f'.repeat(64),
			created_at: 1_700_000_000,
			content: {
				escrowId: 'svc-escrow_123',
				contextType: 'service',
				contextTitle: 'Premium Logo Package',
				contextDescription: 'Logo system and brand guide',
				taskTitle: 'Premium Logo Package',
				taskDescription: 'Logo system and brand guide',
				amount: '0.01',
				purchaseMode: 'quote',
				quoteRequestId: 'qr_valid123',
				proposalId: 'proposal_valid123',
				selectedTierId: 'Tier 1',
				estimatedStartTime: 1_700_086_400,
				estimatedCompletionTime: 1_700_345_600,
				agreementSnapshot: {
					deliverables: 'Logo system and brand guide',
					priceSnapshotLabel: '$250.00',
					selectedAddOns: ['Source files'],
					inquiryAnswers: {
						Industry: 'Fintech'
					}
				},
				pricingSnapshot: {
					serviceVersionRef: 'service-event-1'
				}
			}
		},
		disputeProposal: null
	} as any;
}

describe('ContractDrawer service context', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		contractStoreState.set({
			contract: buildServiceContract(),
			contracts: [],
			isDrawerOpen: true,
			isResolutionFormOpen: false
		});
	});

	it('renders service agreement details and service-aware actions from the shared drawer', async () => {
		render(ContractDrawer, {
			btcPrice: 100000
		});

		expect(screen.getByRole('dialog')).toBeInTheDocument();
		expect(screen.getAllByText('Premium Logo Package').length).toBeGreaterThan(0);
		expect(screen.getByText('Quoted Service')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Service agreement' }));

		expect(screen.getByTestId('service-agreement-summary')).toBeInTheDocument();
		expect(screen.getByTestId('service-agreement-scope')).toHaveTextContent(
			'Logo system and brand guide'
		);
		expect(screen.getByTestId('service-agreement-tier')).toHaveTextContent('Tier 1');
		expect(screen.getByTestId('service-agreement-start')).not.toHaveTextContent('');
		expect(screen.getByTestId('service-agreement-end')).not.toHaveTextContent('');
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ContractDrawer from '$lib/components/contracts/ContractDrawer.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

const { contractStoreState, getContractKey } = vi.hoisted(() => {
	type MockContractRecord = {
		contractEvent: {
			content: Record<string, unknown>;
		};
		escrowData: {
			id: string;
		};
	};
	type MockStoreState = {
		contract: unknown;
		contracts: unknown[];
		isDrawerOpen: boolean;
		isResolutionFormOpen: boolean;
	};

	let value = {
		contract: null as unknown,
		contracts: [] as unknown[],
		isDrawerOpen: true,
		isResolutionFormOpen: false
	} satisfies MockStoreState;
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
		getContractKey: vi.fn((contract: MockContractRecord, key: string) => {
			if (key === 'otherPartyNpub') return 'npub1counterparty';
			if (key === 'clientPubkey') return 'npub1client';
			if (key === 'amount') return contract.contractEvent.content.amount;
			if (key === 'taskTitle' || key === 'contextTitle')
				return contract.contractEvent.content.contextTitle;
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
		$$render: (
			_result: unknown,
			props: { contract: { contractEvent: { content: { contextType?: string } } } }
		) =>
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
				serviceId: 'premium-logo-package',
				amount: '0.01',
				purchaseMode: 'instant_buy',
				quoteRequestId: 'qr_valid123',
				proposalId: 'proposal_valid123',
				selectedTierId: '26226ebd-121c-493a-af08-4f8b8e59306d',
				estimatedStartTime: 1_700_086_400,
				estimatedCompletionTime: 1_700_345_600,
				agreementSnapshot: {
					selectedTierLabel: 'Premium',
					serviceLocation: {
						mode: 'taskee_location',
						label: '123 Main St, San Salvador, El Salvador',
						location: {
							displayName: '123 Main St, San Salvador, El Salvador',
							formattedAddress: '123 Main St, San Salvador, El Salvador',
							latitude: 13.6929,
							longitude: -89.2182,
							locationLoaded: true
						}
					},
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
	} as unknown;
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
		expect(screen.getAllByText('Book Now')).toHaveLength(1);
		expect(screen.queryByText('dashboard.client')).toBeNull();
		expect(screen.queryByText('dashboard.freelancer')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Service agreement' })).toBeNull();
		expect(screen.queryByTestId('service-agreement-summary')).toBeNull();
		expect(screen.queryByTestId('drawer-deadline')).toBeNull();

		const serviceLink = screen.getByRole('link', { name: 'Premium Logo Package' });
		expect(serviceLink).toHaveAttribute('href', '/services/premium-logo-package');
		expect(serviceLink.className).toContain('card-title');
		expect(screen.getByTestId('service-contract-title-price-row')).toHaveTextContent(
			'Premium Logo Package'
		);
		expect(screen.getByText('Premium')).toBeInTheDocument();
		expect(screen.queryByText(/Tier:/)).toBeNull();
		expect(screen.queryByText('26226ebd-121c-493a-af08-4f8b8e59306d')).toBeNull();
		expect(screen.getByTestId('service-contract-usd-price')).toHaveTextContent('$1000.00');
		expect(screen.getByTestId('service-contract-description-sats-row')).toHaveTextContent(
			'Logo system and brand guide'
		);
		expect(screen.getByTestId('service-contract-sats-price')).toHaveTextContent('1,000,000 Sats');
		expect(screen.getByTestId('service-contract-location')).toHaveTextContent(
			'123 Main St, San Salvador, El Salvador'
		);
		expect(screen.getByTestId('service-contract-location-link')).toHaveAttribute(
			'href',
			expect.stringContaining('google.com/maps/search')
		);
		expect(screen.getByTestId('service-contract-location-link')).toHaveTextContent('Open Map');

		expect(screen.getByTestId('service-contract-start-datetime')).toHaveTextContent('Start Date');
		expect(screen.getByTestId('service-contract-end-datetime')).toHaveTextContent('End Date');
	});
});

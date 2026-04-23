import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ContractDrawer from '$lib/components/contracts/ContractDrawer.svelte';
import { EscrowStatus } from '$lib/utils/escrow';
import KINDS from '$lib/utils/constants/kinds';

const { contractStoreState, getContractKey } = vi.hoisted(() => {
	type MockStoreState = {
		contract: unknown;
		contracts: unknown[];
		isDrawerOpen: boolean;
		isResolutionFormOpen: boolean;
	};

	let value: MockStoreState = {
		contract: null,
		contracts: [],
		isDrawerOpen: true,
		isResolutionFormOpen: false
	};

	const subscribers = new Set<(v: MockStoreState) => void>();
	const state = {
		subscribe(run: (v: MockStoreState) => void) {
			run(value);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		set(next: MockStoreState) {
			value = next;
			subscribers.forEach((run) => run(value));
		},
		update(updater: (v: MockStoreState) => MockStoreState) {
			state.set(updater(value));
		}
	};

	return {
		contractStoreState: state,
		getContractKey: vi.fn(
			(
				contract: {
					contractEvent: { content: Record<string, unknown> };
					escrowData: { id: string };
				},
				key: string
			) => {
				if (key === 'otherPartyNpub') return 'npub1counterparty';
				if (key === 'clientPubkey') return 'npub1client';
				if (key === 'amount') return contract.contractEvent.content.amount as string;
				if (key === 'taskTitle' || key === 'contextTitle')
					return contract.contractEvent.content.contextTitle as string;
				if (key === 'taskDescription' || key === 'contextDescription') {
					return contract.contractEvent.content.contextDescription as string;
				}
				if (key === 'estimatedStartTime')
					return contract.contractEvent.content.estimatedStartTime as number;
				if (key === 'estimatedCompletionTime') {
					return contract.contractEvent.content.estimatedCompletionTime as number;
				}
				if (key === 'escrowId') return contract.escrowData.id;
				return contract.contractEvent.content[key];
			}
		)
	};
});

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		subscribe: contractStoreState.subscribe,
		set: contractStoreState.set,
		update: contractStoreState.update,
		getContractKey,
		getContractKeyById: vi.fn()
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$lib/stores/scrollContainer.store', () => ({
	appScrollContainer: {
		subscribe: (run: (val: unknown) => void) => {
			run(null);
			return () => {};
		}
	}
}));

// Mock queryNostrEvents
const mockQueryNostrEvents = vi.fn();
vi.mock('$lib/utils/nostr', () => ({
	queryNostrEvents: (...args: unknown[]) => mockQueryNostrEvents(...args)
}));

// Mock translation dependencies for TranslatableBidContent
vi.mock('$lib/stores/translation.store', () => ({
	currentUserLanguage: {
		subscribe: (run: (val: string) => void) => {
			run('en');
			return () => {};
		}
	}
}));

vi.mock('$lib/services/bid-translation.service', () => ({
	bidTranslationService: {
		getDisplayContent: (_bid: unknown, _type: unknown, _lang: unknown, content: string) => content,
		getStoredTranslation: () => null
	}
}));

// Simple mocks for other sub-components
vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: () => ({ $$render: () => 'Deadline' })
}));
vi.mock('$lib/components/shared/UsdSatsDisplay.svelte', () => ({
	default: () => ({ $$render: () => 'Price' })
}));
vi.mock('$lib/components/contracts/ContractTimeline.svelte', () => ({
	default: () => ({ $$render: () => 'Timeline' })
}));
vi.mock('$lib/components/contracts/ContractActions.svelte', () => ({
	default: () => ({ $$render: () => 'Actions' })
}));
vi.mock('$lib/components/contracts/ContractContextSummary.svelte', () => ({
	default: () => ({ $$render: () => 'Context' })
}));
vi.mock('$lib/components/Gallery.svelte', () => ({
	default: () => ({ $$render: () => 'Gallery' })
}));
vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: () => ({ $$render: () => 'User' })
}));

describe('ContractDrawer - Bid Details', () => {
	const mockBidId = 'bid-123';
	const mockContract = {
		contractEvent: {
			id: 'contract-event-id',
			content: {
				escrowId: 'escrow-123',
				proposalEventId: mockBidId,
				amount: '0.001',
				contextType: 'task',
				contextTitle: 'Test Task'
			}
		},
		escrowData: {
			id: 'escrow-123',
			status: EscrowStatus.Funded
		},
		status: EscrowStatus.Funded,
		isClient: true
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Set default mock implementation
		mockQueryNostrEvents.mockResolvedValue([]);

		contractStoreState.set({
			contract: mockContract,
			contracts: [mockContract],
			isDrawerOpen: true,
			isResolutionFormOpen: false
		});
	});

	it('fetches and displays bid details when accordion is opened', async () => {
		const mockBidContent = {
			proposedApproach: 'My proposed approach',
			coverLetter: 'My cover letter'
		};

		mockQueryNostrEvents.mockResolvedValue([
			{
				id: mockBidId,
				kind: KINDS.BIDS,
				content: mockBidContent
			}
		]);

		render(ContractDrawer, { btcPrice: 60000 });

		// Verify drawer title renders
		expect(screen.getByText('Test Task')).toBeTruthy();

		// Find the "Bid Details" accordion title
		const accordionButton = screen.getByText('dashboard.contracts.bid_details');

		// Click to open
		await fireEvent.click(accordionButton);

		// Wait for fetch to complete
		await waitFor(
			() => {
				expect(mockQueryNostrEvents).toHaveBeenCalled();
			},
			{ timeout: 2000 }
		);

		// Verify content is displayed
		await waitFor(
			() => {
				expect(screen.getByText('My proposed approach')).toBeTruthy();
				expect(screen.getByText('My cover letter')).toBeTruthy();
			},
			{ timeout: 2000 }
		);
	});

	it('shows error message if bid fetch fails', async () => {
		mockQueryNostrEvents.mockRejectedValue(new Error('Network error'));

		render(ContractDrawer, { btcPrice: 60000 });

		const accordionButton = screen.getByText('dashboard.contracts.bid_details');
		await fireEvent.click(accordionButton);

		await waitFor(() => {
			expect(screen.getByText('Failed to load bid details')).toBeTruthy();
		});
	});

	it('shows "not available" if bid not found', async () => {
		mockQueryNostrEvents.mockResolvedValue([]);

		render(ContractDrawer, { btcPrice: 60000 });

		const accordionButton = screen.getByText('dashboard.contracts.bid_details');
		await fireEvent.click(accordionButton);

		await waitFor(() => {
			expect(screen.getByText('Bid not found')).toBeTruthy();
		});
	});
});

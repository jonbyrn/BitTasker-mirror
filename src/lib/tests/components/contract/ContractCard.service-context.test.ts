import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import ContractCard from '$lib/components/contracts/ContractCard.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

type ContractEventContent = Record<string, unknown>;
type MockContract = {
	contractEvent: {
		created_at?: number;
		content: ContractEventContent;
	};
	statusEvents?: Array<{ pubkey: string; content: { action: string } }>;
	disputeProposal?: unknown;
	isClient?: boolean;
	isPending?: boolean;
	blockchainStatus?: string | null;
	permissions?: Record<string, boolean>;
};

const { contractStoreState, getContractKey } = vi.hoisted(() => {
	let value = {
		contract: null,
		isDrawerOpen: false
	};
	const subscribers = new Set<(value: typeof value) => void>();
	const state = {
		subscribe(run: (value: typeof value) => void) {
			run(value);
			subscribers.add(run);
			return () => subscribers.delete(run);
		},
		set(next: typeof value) {
			value = next;
			subscribers.forEach((run) => run(value));
		},
		update(updater: (value: typeof value) => typeof value) {
			state.set(updater(value));
		}
	};
	return {
		contractStoreState: state,
		getContractKey: vi.fn((contract: MockContract, key: string) => {
			if (key === 'otherPartyNpub') return 'npub1counterparty';
			if (key === 'clientPubkey') return 'npub1client';
			if (key === 'estimatedCompletionTime')
				return contract.contractEvent.content.estimatedCompletionTime;
			if (key === 'amount') return contract.contractEvent.content.amount;
			if (key === 'taskTitle') return contract.contractEvent.content.taskTitle;
			if (key === 'taskDescription') return contract.contractEvent.content.taskDescription;
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

vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getStatusTranslationKey: vi.fn(() => 'contract.status'),
	getStatusColorClass: vi.fn(() => 'badge-neutral'),
	getCancellationStatusVariant: vi.fn().mockReturnValue('default')
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/components/contracts/ContractActions.svelte', () => ({
	default: () => ({
		$$render: (
			_result: unknown,
			props: {
				isInline?: boolean;
				maxInlineActions?: number | null;
			}
		) =>
			`<div data-testid="contract-actions">actions-${props.isInline ? 'inline' : 'drawer'}-${props.maxInlineActions ?? 'all'}</div>`
	})
}));

vi.mock('$lib/components/contracts/ContractContextSummary.svelte', () => ({
	default: () => ({
		$$render: (_result: unknown, props: { contract: MockContract }) =>
			`<div data-testid="context-summary">${props.contract.contractEvent.content.contextTitle}</div>`
	})
}));

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: () => ({ $$render: () => '<div>User info</div>' })
}));

vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: () => ({ $$render: () => '<div>Deadline</div>' })
}));

vi.mock('$lib/components/task/TaskLocationDisplay.svelte', () => ({
	default: () => ({ $$render: () => '<div>Location</div>' })
}));

vi.mock('$lib/stores/wallet.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		walletStore: writable({
			isConnected: true,
			rsk: { wallet: {}, provider: {} }
		}),
		walletManager: {
			initialize: vi.fn().mockResolvedValue(undefined)
		}
	};
});

function buildContract(overrides: Record<string, unknown> = {}) {
	return {
		contractEvent: {
			created_at: 1_700_000_000,
			content: {
				escrowId: 'escrow-1',
				amount: '0.01',
				taskTitle: 'Fallback task title',
				taskDescription: 'Fallback task description',
				contextType: 'service',
				contextTitle: 'Service contract',
				estimatedCompletionTime: 1_700_000_000,
				purchaseMode: 'quote',
				...overrides
			}
		},
		escrowData: { id: 'escrow-1' },
		isClient: true,
		status: EscrowStatus.Funded,
		isPending: false,
		blockchainStatus: EscrowStatus.Funded,
		statusEvents: [],
		disputeProposal: null,
		permissions: {
			canComplete: false,
			canAccept: true,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		}
	};
}

describe('ContractCard service context', () => {
	beforeEach(() => {
		contractStoreState.set({ contract: null, isDrawerOpen: false });
		getContractKey.mockClear();
	});

	it('renders service purchase labels and actions for service contracts', () => {
		const contract = buildContract();
		render(ContractCard, {
			contract,
			btcPrice: 100000
		});

		expect(screen.getByText('Quoted Service')).toBeInTheDocument();
		expect(screen.getByText('dashboard.contracts.view_details')).toBeInTheDocument();
	});

	it('renders unknown contexts as read-only', () => {
		const contract = buildContract({ contextType: 'alien-context' });
		render(ContractCard, {
			contract,
			btcPrice: 100000
		});

		expect(screen.getByText('Unknown Context')).toBeInTheDocument();
		expect(screen.getByText('Read-only contract context')).toBeInTheDocument();
		expect(screen.queryByTestId('contract-actions')).not.toBeInTheDocument();
	});

	it('opens the drawer when the details button is used', async () => {
		const contract = buildContract();
		render(ContractCard, {
			contract,
			btcPrice: 100000
		});

		await fireEvent.click(screen.getByText('dashboard.contracts.view_details'));

		expect(get(contractStoreState).isDrawerOpen).toBe(true);
		expect(get(contractStoreState).contract).toEqual(contract);
	});

	it('does not mount inline actions for pending contracts', () => {
		const contract = {
			...buildContract(),
			isPending: true,
			permissions: {
				canComplete: false,
				canAccept: true,
				canDispute: true,
				canPropose: false,
				canAcceptProposal: false,
				canCancel: true,
				canResolveTimelock: false,
				canDelete: false
			}
		};

		render(ContractCard, {
			contract,
			btcPrice: 100000
		});

		expect(screen.queryByTestId('contract-actions')).not.toBeInTheDocument();
	});

	it('does not mount inline actions when a proposal is missing despite accept-proposal permissions', () => {
		const contract = {
			...buildContract(),
			permissions: {
				canComplete: false,
				canAccept: false,
				canDispute: false,
				canPropose: false,
				canAcceptProposal: true,
				canCancel: false,
				canResolveTimelock: false,
				canDelete: false
			},
			disputeProposal: null
		};

		render(ContractCard, {
			contract,
			btcPrice: 100000
		});

		expect(screen.queryByTestId('contract-actions')).not.toBeInTheDocument();
	});

	it('does not mount inline actions after the actor exhausts dispute proposals', () => {
		const contract = {
			...buildContract(),
			permissions: {
				canComplete: false,
				canAccept: false,
				canDispute: false,
				canPropose: true,
				canAcceptProposal: true,
				canCancel: false,
				canResolveTimelock: false,
				canDelete: false
			},
			disputeProposal: null,
			statusEvents: [
				{ pubkey: 'npub1client', content: { action: 'DISPUTE_RESOLUTION_PROPOSED' } },
				{ pubkey: 'npub1client', content: { action: 'DISPUTE_RESOLUTION_PROPOSED' } }
			]
		};

		render(ContractCard, {
			contract,
			btcPrice: 100000
		});

		expect(screen.queryByTestId('contract-actions')).not.toBeInTheDocument();
	});

	it('does not mount inline actions when client-side cancellation is blocked by completion', () => {
		const contract = {
			...buildContract(),
			blockchainStatus: EscrowStatus.Completed,
			permissions: {
				canComplete: false,
				canAccept: false,
				canDispute: false,
				canPropose: false,
				canAcceptProposal: false,
				canCancel: true,
				canResolveTimelock: false,
				canDelete: false
			}
		};

		render(ContractCard, {
			contract,
			btcPrice: 100000
		});

		expect(screen.queryByTestId('contract-actions')).not.toBeInTheDocument();
	});
});

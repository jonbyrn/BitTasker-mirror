import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import DashboardContractsPanel from '$lib/components/contracts/DashboardContractsPanel.svelte';
import type { ContractWithEvents, NostrContract } from '$lib/types/contract';
import { EscrowStatus } from '$lib/utils/escrow';

type MockContractStoreState = {
	contracts: ContractWithEvents[];
	contract: ContractWithEvents | null;
	isDrawerOpen: boolean;
	isLoading: boolean;
	error: string | null;
	hasMore: boolean;
	isLoadingMore: boolean;
};

const { contractStoreState, contractStore, scrollStore } = vi.hoisted(() => {
	let value: MockContractStoreState = {
		contracts: [],
		contract: null,
		isDrawerOpen: false,
		isLoading: false,
		error: null,
		hasMore: false,
		isLoadingMore: false
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
		contractStore: {
			subscribe: state.subscribe,
			set: state.set,
			update: state.update,
			getContractKey: vi.fn((contract: ContractWithEvents, key: string) => {
				const content = contract.contractEvent.content as NostrContract & Record<string, unknown>;
				if (key === 'otherPartyNpub') return 'npub1counterparty';
				if (key === 'estimatedCompletionTime') return content.estimatedCompletionTime;
				if (key === 'amount') return content.amount;
				if (key === 'taskTitle' || key === 'contextTitle') return content.contextTitle;
				if (key === 'taskDescription' || key === 'contextDescription')
					return content.contextDescription;
				const value = content[key];
				return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
					? value
					: undefined;
			}),
			loadContracts: vi.fn().mockResolvedValue(undefined),
			loadMoreContracts: vi.fn().mockResolvedValue(undefined),
			loadContractByEscrowId: vi.fn().mockResolvedValue(undefined),
			unsubscribeFromStatusUpdates: vi.fn(),
			unsubscribeFromNewContracts: vi.fn()
		},
		scrollStore: {
			update: vi.fn()
		}
	};
});

vi.mock('$lib/stores/contract.store', () => ({
	contractStore
}));

vi.mock('$lib/stores/task.store', async () => {
	const { writable } = await import('svelte/store');
	return {
		tasksStore: writable({ items: [] }),
		myTasksStore: writable({ items: [] }),
		taskStore: {},
		TASKS_PER_PAGE: 10,
		STEPS: writable([])
	};
});

vi.mock('$lib/utils/helpers/task-status-reconciliation', () => ({
	reconcileTaskStatusWithContracts: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/stores/infiniteScroll.store', () => ({
	scroll: scrollStore
}));

vi.mock('$lib/utils/portal', () => ({
	createPortal: () => ({ destroy() {} })
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(100000)
	}
}));

vi.mock('$lib/components/contracts/ContractDrawer.svelte', () => ({
	default: () => ({ $$render: () => '<div data-testid="contract-drawer"></div>' })
}));

vi.mock('$lib/components/InfiniteScroll.svelte', () => ({
	default: () => ({ $$render: () => '<div data-testid="infinite-scroll"></div>' })
}));

vi.mock('$lib/components/contracts/ContractActions.svelte', () => ({
	default: () => ({ $$render: () => '' })
}));

vi.mock('$lib/components/UserNostrBadge.svelte', () => ({
	default: () => ({ $$render: () => '<div>User badge</div>' })
}));

vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: () => ({ $$render: () => '<div>Deadline</div>' })
}));

vi.mock('$lib/components/task/TaskLocationDisplay.svelte', () => ({
	default: () => ({ $$render: () => '<div>Location</div>' })
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/escrow', async () => {
	const actual = await import('$lib/utils/escrow');
	return {
		...actual,
		escrow: {
			...actual.escrow,
			contractOps: {
				...(actual.escrow?.contractOps ?? {}),
				getContracts: vi.fn().mockResolvedValue([])
			}
		}
	};
});

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

function buildContract(
	id: string,
	contextType?: 'task' | 'service',
	options: {
		isClient?: boolean;
		title?: string;
		description?: string;
	} = {}
): ContractWithEvents {
	return {
		escrowData: { id },
		status: EscrowStatus.Funded,
		isClient: options.isClient ?? true,
		isPending: false,
		blockchainStatus: EscrowStatus.Funded,
		permissions: {
			canComplete: false,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		},
		contractEvent: {
			content: {
				escrowId: id,
				amount: '0.01',
				contextType,
				contextTitle:
					options.title ?? (contextType === 'service' ? 'Service Contract' : 'Task Contract'),
				contextDescription:
					options.description ??
					(contextType === 'service' ? 'Service description' : 'Task description'),
				estimatedCompletionTime: 1_700_000_000
			}
		}
	} as unknown as ContractWithEvents;
}

function buildUnknownContextContract(): ContractWithEvents {
	const contract = buildContract('alien-1', 'task');
	return {
		...contract,
		contractEvent: {
			...contract.contractEvent,
			content: {
				...contract.contractEvent.content,
				contextType: 'alien-context' as NostrContract['contextType'] | 'alien-context',
				contextTitle: 'Alien Contract'
			}
		}
	} as unknown as ContractWithEvents;
}

describe('DashboardContractsPanel context filter', () => {
	function setNavigatorOnline(online: boolean) {
		Object.defineProperty(window.navigator, 'onLine', {
			value: online,
			configurable: true
		});
	}

	beforeEach(() => {
		vi.clearAllMocks();
		setNavigatorOnline(true);
		Element.prototype.scrollIntoView = vi.fn();
		contractStoreState.set({
			contracts: [buildContract('task-1', 'task'), buildContract('svc-1', 'service')],
			contract: null,
			isDrawerOpen: false,
			isLoading: false,
			error: null,
			hasMore: false,
			isLoadingMore: false
		});
	});

	it('filters contracts by service context and consumes highlight callbacks', async () => {
		const onHighlightConsumed = vi.fn();

		render(DashboardContractsPanel, {
			initialContext: 'services',
			highlightEscrowId: 'svc-1',
			onHighlightConsumed
		});

		expect(screen.getAllByText('Service Contract').length).toBeGreaterThan(0);
		expect(screen.queryAllByText('Task Contract')).toHaveLength(0);

		await waitFor(() => {
			expect(onHighlightConsumed).toHaveBeenCalledWith('svc-1');
		});

		const state = get(contractStoreState);
		expect(state.isDrawerOpen).toBe(true);
		expect(state.contract.escrowData.id).toBe('svc-1');
	});

	it('switches between task and service context filters', async () => {
		render(DashboardContractsPanel, {
			initialContext: 'all'
		});

		expect(screen.getAllByText('Task Contract').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Service Contract').length).toBeGreaterThan(0);

		await fireEvent.click(screen.getByText('Tasks'));
		expect(screen.getAllByText('Task Contract').length).toBeGreaterThan(0);
		expect(screen.queryAllByText('Service Contract')).toHaveLength(0);

		await fireEvent.click(screen.getByText('Services'));
		expect(screen.queryAllByText('Task Contract')).toHaveLength(0);
		expect(screen.getAllByText('Service Contract').length).toBeGreaterThan(0);
	});

	it('keeps status filters while hiding role filters for the earnings contracts tab', async () => {
		render(DashboardContractsPanel, {
			initialContext: 'all',
			showRoleFilters: false,
			fixedRole: 'freelancer'
		});

		expect(screen.queryByText('dashboard.contracts.filter_by_status_and_role')).toBeNull();
		expect(screen.queryByText('dashboard.contracts.filter_description')).toBeNull();
		expect(screen.getAllByText('dashboard.contracts.all_statuses').length).toBeGreaterThan(0);
		expect(screen.queryByText('dashboard.contracts.all_roles')).toBeNull();
		expect(screen.getByText('Contract filters')).toBeInTheDocument();
		expect(screen.getByText('All')).toBeInTheDocument();
		expect(screen.getByText('Tasks')).toBeInTheDocument();
		expect(screen.getByText('Services')).toBeInTheDocument();
	});

	it('locks the earnings contracts tab to taskee-side contracts', async () => {
		contractStoreState.set({
			contracts: [
				buildContract('tasker-side', 'service', {
					isClient: true,
					title: 'Tasker-side Service Contract'
				}),
				buildContract('taskee-side', 'service', {
					isClient: false,
					title: 'Taskee-side Service Contract'
				})
			],
			contract: null,
			isDrawerOpen: false,
			isLoading: false,
			error: null,
			hasMore: false,
			isLoadingMore: false
		});

		render(DashboardContractsPanel, {
			initialContext: 'services',
			showRoleFilters: false,
			fixedRole: 'freelancer'
		});

		expect(screen.getAllByText('Taskee-side Service Contract').length).toBeGreaterThan(0);
		expect(screen.queryByText('Tasker-side Service Contract')).toBeNull();
	});

	it('retries highlight recovery once before reporting a missing contract', async () => {
		const onHighlightMissing = vi.fn();

		render(DashboardContractsPanel, {
			initialContext: 'services',
			highlightEscrowId: 'svc-missing',
			onHighlightMissing
		});

		await waitFor(() => {
			expect(contractStore.loadContractByEscrowId).toHaveBeenCalledWith('svc-missing');
		});

		await waitFor(() => {
			expect(onHighlightMissing).toHaveBeenCalledWith('svc-missing');
		});
		expect(contractStore.loadContractByEscrowId).toHaveBeenCalledTimes(1);
	});

	it('shows a syncing notice while highlighted-contract recovery is in flight', async () => {
		let resolveRecovery: (() => void) | null = null;
		vi.mocked(contractStore.loadContractByEscrowId).mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveRecovery = resolve;
				})
		);
		const onHighlightMissing = vi.fn();

		render(DashboardContractsPanel, {
			initialContext: 'services',
			highlightEscrowId: 'svc-recovering',
			onHighlightMissing
		});

		await waitFor(() => {
			expect(contractStore.loadContractByEscrowId).toHaveBeenCalledWith('svc-recovering');
		});
		expect(screen.getByTestId('contracts-panel-highlight-syncing-alert')).toBeInTheDocument();
		expect(onHighlightMissing).not.toHaveBeenCalled();

		resolveRecovery?.();

		await waitFor(() => {
			expect(onHighlightMissing).toHaveBeenCalledWith('svc-recovering');
		});
	});

	it('disables refresh while highlighted contract recovery is still syncing', async () => {
		let resolveRecovery: (() => void) | null = null;
		contractStore.loadContractByEscrowId.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveRecovery = () => resolve(true);
				})
		);

		render(DashboardContractsPanel, {
			initialContext: 'services',
			highlightEscrowId: 'svc-recovering'
		});

		await waitFor(() => {
			expect(screen.getByTestId('contracts-panel-highlight-syncing-alert')).toBeInTheDocument();
		});
		expect(screen.getByRole('button', { name: 'dashboard.contracts.refresh' })).toBeDisabled();

		resolveRecovery?.();

		await waitFor(() => {
			expect(screen.queryByTestId('contracts-panel-highlight-syncing-alert')).toBeNull();
		});
	});

	it('keeps cached contracts visible while a refresh is in flight and shows a partial-sync alert', () => {
		contractStoreState.set({
			contracts: [buildContract('svc-1', 'service')],
			contract: null,
			isDrawerOpen: false,
			isLoading: true,
			error: null,
			hasMore: false,
			isLoadingMore: false
		});

		render(DashboardContractsPanel, {
			initialContext: 'services'
		});

		expect(screen.getByTestId('contracts-panel-partial-alert')).toBeInTheDocument();
		expect(screen.getAllByText('Service Contract').length).toBeGreaterThan(0);
	});

	it('warns once and keeps unknown contract contexts read-only', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		contractStoreState.set({
			contracts: [buildUnknownContextContract()],
			contract: null,
			isDrawerOpen: false,
			isLoading: false,
			error: null,
			hasMore: false,
			isLoadingMore: false
		});

		render(DashboardContractsPanel, {
			initialContext: 'all'
		});

		await waitFor(() => {
			expect(warnSpy).toHaveBeenCalledWith(
				'Unknown contract context encountered; leaving contract read-only.',
				expect.objectContaining({
					escrowId: 'alien-1',
					contextType: 'alien-context'
				})
			);
		});

		warnSpy.mockRestore();
	});

	it('surfaces contract load errors with an inline retry action', async () => {
		contractStoreState.set({
			contracts: [buildContract('svc-1', 'service')],
			contract: null,
			isDrawerOpen: false,
			isLoading: false,
			error: 'contracts query failed',
			hasMore: false,
			isLoadingMore: false
		});

		render(DashboardContractsPanel, {
			initialContext: 'services'
		});

		await waitFor(() => {
			expect(contractStore.loadContracts).toHaveBeenCalled();
		});
		vi.mocked(contractStore.loadContracts).mockClear();
		expect(
			screen.getByText('Showing last known contract data. contracts query failed')
		).toBeTruthy();
		expect(screen.getByTestId('contracts-panel-stale-alert')).toBeInTheDocument();
		expect(screen.getAllByText('Service Contract').length).toBeGreaterThan(0);
		await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(contractStore.loadContracts).toHaveBeenCalledTimes(1);
	});

	it('keeps refresh and retry disabled in-context while offline', async () => {
		contractStoreState.set({
			contracts: [buildContract('svc-1', 'service')],
			contract: null,
			isDrawerOpen: false,
			isLoading: false,
			error: 'contracts query failed',
			hasMore: false,
			isLoadingMore: false
		});

		render(DashboardContractsPanel, {
			initialContext: 'services'
		});

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));

		await waitFor(() => {
			expect(screen.getByTestId('contracts-panel-offline-alert')).toBeInTheDocument();
		});
		expect(screen.getByRole('button', { name: 'dashboard.contracts.refresh' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
	});

	it('shows reconnect guidance after the contracts panel returns online', async () => {
		render(DashboardContractsPanel, {
			initialContext: 'services'
		});

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));
		setNavigatorOnline(true);
		window.dispatchEvent(new Event('online'));

		await waitFor(() => {
			expect(screen.getByTestId('contracts-panel-reconnect-alert')).toBeInTheDocument();
		});
	});
});

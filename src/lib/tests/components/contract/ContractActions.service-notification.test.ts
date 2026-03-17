import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ContractActions from '$lib/components/contracts/ContractActions.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

const {
	contractStoreState,
	contractStore,
	acceptTask,
	disputeTask,
	resolveAfterTimelock,
	sendNotificationToNpubs,
	showErrorToast
} = vi.hoisted(() => {
	let value = {
		contract: null as any,
		isDrawerOpen: false,
		isResolutionFormOpen: false
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
			loadContractByEscrowId: vi.fn().mockResolvedValue(true),
			getContractKey: vi.fn((contract: any, key: string) => {
				if (key === 'otherPartyNpub') return 'npub1counterparty';
				if (key === 'amount') return contract.contractEvent.content.amount;
				if (key === 'taskTitle' || key === 'contextTitle') {
					return contract.contractEvent.content.contextTitle;
				}
				return contract.contractEvent.content[key];
			})
		},
		acceptTask: vi.fn().mockResolvedValue(undefined),
		disputeTask: vi.fn().mockResolvedValue(undefined),
		resolveAfterTimelock: vi.fn().mockResolvedValue(undefined),
		sendNotificationToNpubs: vi.fn(),
		showErrorToast: vi.fn()
	};
});

vi.mock('$lib/stores/contract.store', () => ({
	contractStore
}));

vi.mock('$lib/utils/escrow', () => ({
	EscrowStatus: {
		Funded: 'FUNDED',
		Completed: 'COMPLETED',
		Cancelled: 'CANCELLED'
	},
	escrow: {
		escrowOps: {
			acceptTask,
			resolveAfterTimelock,
			loadEscrowDetails: vi.fn().mockResolvedValue({ status: 'FUNDED' }),
			completeTask: vi.fn(),
			disputeTask,
			proposeResolution: vi.fn(),
			acceptProposal: vi.fn(),
			cancelEscrow: vi.fn()
		},
		contractOps: {
			deleteContract: vi.fn()
		}
	}
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast,
		showSuccessToast: vi.fn()
	}
}));

vi.mock('$lib/i18n/i18n', () => ({
	loadNamespace: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(100000)
	}
}));

vi.mock('$lib/utils/portal', () => ({
	portal: vi.fn()
}));

vi.mock('$lib/utils/location/sendLocation', () => ({
	sendTaskCompletionMessageToTasker: vi.fn(),
	sendPaymentReleasedMessageToTaskee: vi.fn()
}));

vi.mock('$lib/components/contracts/TaskCompletionModal.svelte', () => ({
	default: () => ({
		$$render: () => ''
	})
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

function buildContract({
	permissions,
	content
}: {
	permissions?: Partial<Record<string, boolean>>;
	content?: Record<string, unknown>;
} = {}) {
	return {
		escrowData: { id: 'svc-123' },
		isPending: false,
		isClient: true,
		blockchainStatus: EscrowStatus.Funded,
		statusEvents: [],
		permissions: {
			canComplete: false,
			canAccept: true,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false,
			...permissions
		},
		contractEvent: {
			created_at: 1_700_000_000,
			id: 'contract-event-1',
			content: {
				contextType: 'service',
				contextTitle: 'Premium logo package',
				amount: '0.01',
				estimatedStartTime: 1_700_000_000,
				...content
			}
		},
		disputeProposal: null
	} as any;
}

function buildTaskContract(overrides: { permissions?: Partial<Record<string, boolean>> } = {}) {
	return buildContract({
		permissions: overrides.permissions,
		content: {
			contextType: 'task',
			contextTitle: 'Fix landing page',
			taskTitle: 'Fix landing page'
		}
	});
}

describe('ContractActions service notification continuity', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		contractStoreState.set({
			contract: null,
			isDrawerOpen: false,
			isResolutionFormOpen: false
		});
		vi.stubEnv('VITE_CLIENT_URL', 'https://bittasker.test');
	});

	it('sends service accept notifications to the exact highlighted contracts route', async () => {
		render(ContractActions, {
			contract: buildContract(),
			isInline: false
		});

		await fireEvent.click(screen.getAllByRole('button', { name: 'Accept Service' })[0]);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Accept Service' })[1]);

		await waitFor(() => {
			expect(acceptTask).toHaveBeenCalledTimes(1);
		});

		expect(sendNotificationToNpubs).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'payment_released',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);
	});

	it('uses the same highlighted service contracts route for timelock resolution', async () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canAccept: false,
					canResolveTimelock: true
				}
			}),
			isInline: false
		});

		await fireEvent.click(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.resolve_timelock' })
		);

		await waitFor(() => {
			expect(resolveAfterTimelock).toHaveBeenCalledTimes(1);
		});

		expect(sendNotificationToNpubs).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'timelock_resolved',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);
	});

	it('uses service-aware action labels for the shared action buttons', () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canComplete: true,
					canAccept: true,
					canDispute: true,
					canCancel: true
				}
			}),
			isInline: true
		});

		expect(screen.getByRole('button', { name: 'Mark Service Complete' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Accept Service' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Dispute Service' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cancel Service Contract' })).toBeInTheDocument();
	});

	it('preserves task-context labels through the same shared action button path', () => {
		render(ContractActions, {
			contract: buildTaskContract({
				permissions: {
					canComplete: true,
					canAccept: true,
					canDispute: true,
					canCancel: true
				}
			}),
			isInline: true
		});

		expect(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.complete_task' })
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.accept_work' })
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.dispute_work' })
		).toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
		).toBeInTheDocument();
	});

	it('keeps shared contract actions disabled in-context while offline', async () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canComplete: true,
					canAccept: true,
					canDispute: true,
					canCancel: true
				}
			}),
			isInline: true
		});

		window.dispatchEvent(new Event('offline'));

		await waitFor(() => {
			expect(screen.getByTestId('contract-actions-offline-alert')).toBeInTheDocument();
		});

		expect(screen.getByRole('button', { name: 'Mark Service Complete' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Accept Service' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Dispute Service' })).toBeDisabled();
		expect(screen.getByRole('button', { name: 'Cancel Service Contract' })).toBeDisabled();
	});

	it('shows reconnect guidance after contract actions recover from an offline state', async () => {
		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canAccept: true
				}
			}),
			isInline: true
		});

		window.dispatchEvent(new Event('offline'));
		await waitFor(() => {
			expect(screen.getByTestId('contract-actions-offline-alert')).toBeInTheDocument();
		});

		window.dispatchEvent(new Event('online'));
		await waitFor(() => {
			expect(screen.getByTestId('contract-actions-reconnect-alert')).toBeInTheDocument();
		});
	});

	it('keeps the service contract surface open and refreshes state for stale accept failures', async () => {
		acceptTask.mockRejectedValueOnce(new Error('invalid escrow state'));

		render(ContractActions, {
			contract: buildContract(),
			isInline: false
		});

		await fireEvent.click(screen.getAllByRole('button', { name: 'Accept Service' })[0]);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Accept Service' })[1]);

		await waitFor(() => {
			expect(contractStore.loadContractByEscrowId).toHaveBeenCalledWith('svc-123');
		});
		expect(screen.getByTestId('contract-actions-stale-alert')).toHaveTextContent(
			'This service contract changed or the action is no longer available. Refreshing the latest contract state.'
		);
		expect(showErrorToast).not.toHaveBeenCalled();
	});

	it('refreshes stale dispute state in place instead of only toasting on service contract action failures', async () => {
		disputeTask.mockRejectedValueOnce(new Error('already disputed'));

		render(ContractActions, {
			contract: buildContract({
				permissions: {
					canAccept: false,
					canDispute: true
				}
			}),
			isInline: false
		});

		await fireEvent.click(screen.getAllByRole('button', { name: 'Dispute Service' })[0]);
		await fireEvent.click(screen.getAllByRole('button', { name: 'Dispute Service' })[1]);

		await waitFor(() => {
			expect(contractStore.loadContractByEscrowId).toHaveBeenCalledWith('svc-123');
		});
		expect(screen.getByTestId('contract-actions-stale-alert')).toBeInTheDocument();
		expect(showErrorToast).not.toHaveBeenCalled();
	});
});

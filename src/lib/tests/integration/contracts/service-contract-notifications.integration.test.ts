import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ContractActions from '$lib/components/contracts/ContractActions.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

type MockContractStoreState = {
	contract: unknown;
	isDrawerOpen: boolean;
	isResolutionFormOpen: boolean;
};

type MockContractContent = Record<string, unknown>;

const hoisted = vi.hoisted(() => {
	let value: MockContractStoreState = {
		contract: null,
		isDrawerOpen: false,
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
		update(updater: (currentValue: typeof value) => typeof value) {
			state.set(updater(value));
		}
	};

	return {
		contractStoreState: state,
		contractStore: {
			subscribe: state.subscribe,
			set: state.set,
			update: state.update,
			getContractKey: vi.fn(
				(contract: { contractEvent: { content: MockContractContent } }, key: string) => {
					if (key === 'otherPartyNpub') return 'npub1counterparty';
					if (key === 'amount') return contract.contractEvent.content.amount;
					if (key === 'taskTitle' || key === 'contextTitle') {
						return contract.contractEvent.content.contextTitle;
					}
					return contract.contractEvent.content[key];
				}
			)
		},
		completeTask: vi.fn().mockResolvedValue(undefined),
		disputeTask: vi.fn().mockResolvedValue(undefined),
		proposeResolution: vi.fn().mockResolvedValue(undefined),
		acceptProposal: vi.fn().mockResolvedValue(undefined),
		cancelEscrow: vi.fn().mockResolvedValue(undefined),
		sendNotificationToNpubs: vi.fn(),
		showErrorToast: vi.fn()
	};
});

const {
	contractStoreState,
	completeTask,
	disputeTask,
	proposeResolution,
	acceptProposal,
	cancelEscrow,
	sendNotificationToNpubs,
	showErrorToast
} = hoisted;

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: hoisted.contractStore
}));

vi.mock('$lib/utils/escrow', () => ({
	EscrowStatus: {
		Funded: 'FUNDED',
		Completed: 'COMPLETED',
		Cancelled: 'CANCELLED'
	},
	escrow: {
		escrowOps: {
			loadEscrowDetails: vi.fn().mockResolvedValue({ status: 'FUNDED' }),
			completeTask: (...args: unknown[]) => hoisted.completeTask(...args),
			acceptTask: vi.fn().mockResolvedValue(undefined),
			disputeTask: (...args: unknown[]) => hoisted.disputeTask(...args),
			proposeResolution: (...args: unknown[]) => hoisted.proposeResolution(...args),
			acceptProposal: (...args: unknown[]) => hoisted.acceptProposal(...args),
			cancelEscrow: (...args: unknown[]) => hoisted.cancelEscrow(...args),
			resolveAfterTimelock: vi.fn().mockResolvedValue(undefined)
		},
		contractOps: {
			deleteContract: vi.fn().mockResolvedValue(undefined)
		}
	}
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs: (...args: unknown[]) => hoisted.sendNotificationToNpubs(...args)
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: (...args: unknown[]) => hoisted.showErrorToast(...args),
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

vi.mock('$lib/stores/task.store', () => ({
	taskStore: { subscribe: vi.fn(), set: vi.fn(), update: vi.fn() },
	tasksStore: {
		subscribe: vi.fn(),
		set: vi.fn(),
		update: vi.fn(),
		removePubkeyTasks: vi.fn(),
		reset: vi.fn()
	},
	myTasksStore: { subscribe: vi.fn(), set: vi.fn(), update: vi.fn(), reset: vi.fn() },
	TASKS_PER_PAGE: 10,
	STEPS: { subscribe: vi.fn(), update: vi.fn() }
}));

vi.mock('$lib/utils/location/sendLocation', () => ({
	sendTaskCompletionMessageToTasker: vi.fn(),
	sendPaymentReleasedMessageToTaskee: vi.fn()
}));

vi.mock('$lib/components/contracts/TaskCompletionModal.svelte', async () => ({
	default: (await import('$lib/tests/fixtures/MockTaskCompletionModal.svelte')).default
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

function buildServiceContract({
	permissions,
	disputeProposal: disputeProposalOverride = null,
	content = {}
}: {
	permissions?: Partial<Record<string, boolean>>;
	disputeProposal?: unknown;
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
			canAccept: false,
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
				taskTitle: 'Premium logo package',
				amount: '0.01',
				estimatedStartTime: 1_700_000_000,
				estimatedCompletionTime: 1_700_086_400,
				...content
			}
		},
		disputeProposal: disputeProposalOverride
	} as unknown;
}

describe('service contract notification parity integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		contractStoreState.set({
			contract: null,
			isDrawerOpen: false,
			isResolutionFormOpen: false
		});
		vi.stubEnv('VITE_CLIENT_URL', 'https://bittasker.test');
	});

	it('sends the exact services contracts route after service completion', async () => {
		render(ContractActions, {
			contract: buildServiceContract({
				permissions: {
					canComplete: true
				}
			}),
			isInline: false
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Mark Service Complete' }));
		await fireEvent.click(screen.getByTestId('mock-task-completion-confirm'));

		await waitFor(() => expect(completeTask).toHaveBeenCalledTimes(1));
		expect(sendNotificationToNpubs).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'task_completed',
				title: 'Service completed',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);
	});

	it('sends a dispute notification to the exact services contracts route', async () => {
		render(ContractActions, {
			contract: buildServiceContract({
				permissions: {
					canDispute: true
				}
			}),
			isInline: false
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Dispute Service' }));
		await fireEvent.click(screen.getAllByRole('button', { name: 'Dispute Service' })[1]);
		await waitFor(() => expect(disputeTask).toHaveBeenCalledTimes(1));

		expect(sendNotificationToNpubs).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: 'dispute_raised',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);
	});

	it('sends a cancellation notification to the exact services contracts route', async () => {
		render(ContractActions, {
			contract: buildServiceContract({
				permissions: {
					canCancel: true
				},
				content: {
					estimatedStartTime: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60
				}
			}),
			isInline: false
		});

		await fireEvent.click(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })
		);
		await fireEvent.click(
			screen.getAllByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' }).at(-1)!
		);
		await waitFor(() => expect(cancelEscrow).toHaveBeenCalledTimes(1));

		expect(sendNotificationToNpubs).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: 'escrow_cancelled',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);
	});

	it('sends resolution proposal and acceptance notifications to the exact services contracts route', async () => {
		render(ContractActions, {
			contract: buildServiceContract({
				permissions: {
					canPropose: true,
					canAcceptProposal: true
				},
				disputeProposal: {
					clientAmount: '0.003',
					freelancerAmount: '0.007',
					proposer: 'npub1counterparty'
				}
			}),
			isInline: false
		});

		await fireEvent.click(
			screen.getAllByRole('button', {
				name: /dashboard\.contracts\.actions\.counter_proposal|dashboard\.contracts\.actions\.propose_resolution/
			})[0]
		);
		const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement | null;
		if (!amountInput) {
			throw new Error('Expected resolution amount input to be present.');
		}
		await fireEvent.input(amountInput, { target: { value: '400.00' } });
		await fireEvent.click(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.propose' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Propose' }));

		await waitFor(() => expect(proposeResolution).toHaveBeenCalledTimes(1));
		expect(sendNotificationToNpubs).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: 'resolution_proposed',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);

		await fireEvent.click(
			screen.getByRole('button', { name: 'dashboard.contracts.actions.accept_proposal' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Accept Proposal' }));
		await waitFor(() => expect(acceptProposal).toHaveBeenCalledTimes(1));
		expect(sendNotificationToNpubs).toHaveBeenLastCalledWith(
			expect.objectContaining({
				type: 'proposal_accepted',
				clickAction:
					'https://bittasker.test/dashboard?tab=contracts&context=services&highlight=svc-123'
			})
		);
	});

	it('does not send a push notification when a service dispute action fails', async () => {
		disputeTask.mockRejectedValueOnce(new Error('rpc unavailable'));

		render(ContractActions, {
			contract: buildServiceContract({
				permissions: {
					canDispute: true
				}
			}),
			isInline: false
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Dispute Service' }));
		await fireEvent.click(screen.getAllByRole('button', { name: 'Dispute Service' })[1]);

		await waitFor(() => expect(showErrorToast).toHaveBeenCalledTimes(1));
		expect(sendNotificationToNpubs).not.toHaveBeenCalled();
	});
});

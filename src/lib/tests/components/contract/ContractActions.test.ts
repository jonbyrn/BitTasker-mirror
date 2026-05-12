import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
	mockRefundClient: vi.fn(),
	mockCancelEscrow: vi.fn(),
	mockShowErrorToast: vi.fn(),
	mockSendNotificationToNpubs: vi.fn(),
	mockGetCurrentPrice: vi.fn(),
	mockGetContractKey: vi.fn(),
	mockLoadNamespace: vi.fn()
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	const translations: Record<string, string> = {
		'dashboard.contracts.actions.cancel_contract': 'Cancel Contract',
		'dashboard.contracts.actions.cancel_contract_confirm_title': 'Cancel Contract',
		'dashboard.contracts.actions.cancel_contract_confirm_message': 'Cancel and refund all funds.',
		'dashboard.contracts.actions.refund_tasker': 'Refund Tasker',
		'dashboard.contracts.actions.refund_tasker_confirm_title': 'Refund Tasker',
		'dashboard.contracts.actions.refund_tasker_confirm_message': 'Refund the tasker in full.',
		'dashboard.contracts.actions.cancel': 'Cancel'
	};

	const translate = (key: string) => translations[key] ?? key;

	return {
		t: readable(translate),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/escrow', () => ({
	EscrowStatus: {
		Funded: 0,
		InDispute: 1,
		Completed: 4,
		Cancelled: 5,
		FundsReleased: 10
	},
	escrow: {
		escrowOps: {
			loadEscrowDetails: vi.fn(),
			completeTask: vi.fn(),
			acceptTask: vi.fn(),
			disputeTask: vi.fn(),
			proposeResolution: vi.fn(),
			acceptProposal: vi.fn(),
			cancelEscrow: mocks.mockCancelEscrow,
			refundClient: mocks.mockRefundClient,
			resolveAfterTimelock: vi.fn()
		},
		contractOps: {
			deleteContract: vi.fn()
		}
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: mocks.mockShowErrorToast,
		showSuccessToast: vi.fn(),
		showInfoToast: vi.fn()
	}
}));

vi.mock('$lib/stores/contract.store', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({
		contract: null,
		isDrawerOpen: false,
		isResolutionFormOpen: false
	});

	return {
		contractStore: {
			subscribe: store.subscribe,
			set: store.set,
			update: store.update,
			getContractKey: mocks.mockGetContractKey
		}
	};
});

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs: mocks.mockSendNotificationToNpubs
	}
}));

vi.mock('$lib/i18n/i18n', () => ({
	loadNamespace: mocks.mockLoadNamespace
}));

vi.mock('$lib/utils/portal', () => ({
	portal: () => ({ destroy: () => {} })
}));

// task.store has an IIFE that calls get(appStore) on module load.
// The appStore mock lacks subscribe, so we mock the entire module to prevent the IIFE from executing.
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

vi.mock('$lib/components/contracts/TaskCompletionModal.svelte', () => ({
	default: vi.fn(() => ({ $$: { ctx: [] } }))
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: mocks.mockGetCurrentPrice
	}
}));

vi.mock('$lib/utils/location/sendLocation', () => ({
	sendTaskCompletionMessageToTasker: vi.fn(),
	sendPaymentReleasedMessageToTaskee: vi.fn()
}));

import ContractActions from '$lib/components/contracts/ContractActions.svelte';

function createContract(overrides: Record<string, unknown> = {}) {
	const nowSeconds = Math.floor(Date.now() / 1000);

	return {
		contractEvent: {
			id: 'contract-event-1',
			pubkey: 'npub1client',
			kind: 1,
			sig: 'sig',
			tags: [],
			created_at: nowSeconds - 7200,
			content: {
				escrowId: 'escrow-1',
				taskId: 'task-1',
				taskTitle: 'Refundable Task',
				taskDescription: 'Task description',
				clientPubkey: 'npub1client',
				freelancerPubkey: 'npub1freelancer',
				amount: '1.0',
				currency: 'RBTC',
				status: 0,
				estimatedStartTime: nowSeconds + 43200,
				estimatedCompletionTime: nowSeconds + 46800,
				type: 'contract',
				transactionHash: '0xcreate',
				contractAddress: '0xcontract'
			}
		},
		statusEvents: [],
		isClient: false,
		blockchainStatus: 0,
		escrowData: {
			id: 'escrow-1',
			status: 0,
			estimatedStartTime: nowSeconds + 43200,
			estimatedCompletionTime: nowSeconds + 46800,
			timelockExpiry: nowSeconds + 604800,
			createdAt: (nowSeconds - 7200) * 1000
		},
		status: 0,
		isPending: false,
		permissions: {
			canComplete: false,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canRefund: true,
			canResolveTimelock: false,
			canDelete: false
		},
		disputeProposal: null,
		completionAttachments: null,
		...overrides
	};
}

describe('ContractActions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mockGetCurrentPrice.mockResolvedValue(60000);
		mocks.mockLoadNamespace.mockResolvedValue(undefined);
		mocks.mockRefundClient.mockResolvedValue({
			hash: '0xrefund',
			escrowId: 'escrow-1',
			status: 'pending'
		});
		mocks.mockCancelEscrow.mockResolvedValue({
			hash: '0xcancel',
			escrowId: 'escrow-1',
			status: 'pending'
		});
		mocks.mockGetContractKey.mockImplementation((contract, key: string) => {
			const content = contract.contractEvent.content;
			const escrowData = contract.escrowData;

			switch (key) {
				case 'estimatedStartTime':
					return escrowData.estimatedStartTime;
				case 'otherPartyNpub':
					return contract.isClient ? content.freelancerPubkey : content.clientPubkey;
				case 'taskTitle':
					return content.taskTitle;
				case 'taskId':
					return content.taskId;
				case 'clientPubkey':
					return content.clientPubkey;
				case 'amount':
					return content.amount;
				default:
					return content[key as keyof typeof content];
			}
		});
	});

	it('renders a refund button for taskee contracts', () => {
		render(ContractActions, {
			contract: createContract()
		});

		expect(screen.getByRole('button', { name: 'Refund Tasker' })).toBeDefined();
		expect(screen.queryByRole('button', { name: 'Cancel Contract' })).toBeNull();
	});

	it('calls refundClient instead of cancelEscrow for taskee refunds', async () => {
		const contract = createContract();
		render(ContractActions, { contract });

		await fireEvent.click(screen.getByRole('button', { name: 'Refund Tasker' }));

		expect(screen.getByText('Refund the tasker in full.')).toBeDefined();

		const refundButtons = screen.getAllByRole('button', { name: 'Refund Tasker' });
		await fireEvent.click(refundButtons[1]);

		await waitFor(() => {
			expect(mocks.mockRefundClient).toHaveBeenCalledWith(contract);
		});

		expect(mocks.mockCancelEscrow).not.toHaveBeenCalled();
		expect(mocks.mockShowErrorToast).not.toHaveBeenCalled();
	});

	it('allows taskee refunds even when the client cancel window would be blocked', async () => {
		const nowSeconds = Math.floor(Date.now() / 1000);
		const contract = createContract({
			contractEvent: {
				...createContract().contractEvent,
				created_at: nowSeconds - 7200,
				content: {
					...createContract().contractEvent.content,
					estimatedStartTime: nowSeconds + 12 * 3600
				}
			},
			escrowData: {
				...createContract().escrowData,
				createdAt: (nowSeconds - 7200) * 1000,
				estimatedStartTime: nowSeconds + 12 * 3600
			}
		});

		render(ContractActions, { contract });

		await fireEvent.click(screen.getByRole('button', { name: 'Refund Tasker' }));

		expect(screen.getByText('Refund the tasker in full.')).toBeDefined();

		const refundButtons = screen.getAllByRole('button', { name: 'Refund Tasker' });
		await fireEvent.click(refundButtons[1]);

		await waitFor(() => {
			expect(mocks.mockRefundClient).toHaveBeenCalledWith(contract);
		});

		expect(mocks.mockCancelEscrow).not.toHaveBeenCalled();
		expect(mocks.mockShowErrorToast).not.toHaveBeenCalled();
	});

	it('renders a cancel button for client contracts', () => {
		render(ContractActions, {
			contract: createContract({
				isClient: true,
				permissions: {
					canComplete: false,
					canAccept: false,
					canDispute: false,
					canPropose: false,
					canAcceptProposal: false,
					canCancel: true,
					canRefund: false,
					canResolveTimelock: false,
					canDelete: false
				}
			})
		});

		expect(screen.getByRole('button', { name: 'Cancel Contract' })).toBeDefined();
		expect(screen.queryByRole('button', { name: 'Refund Tasker' })).toBeNull();
	});
});

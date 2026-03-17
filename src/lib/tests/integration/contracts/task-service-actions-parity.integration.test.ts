import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/svelte';
import ContractActions from '$lib/components/contracts/ContractActions.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

const hoisted = vi.hoisted(() => {
	let value = {
		contract: null as any,
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
		}
	};

	return {
		contractStoreState: state,
		contractStore: {
			subscribe: state.subscribe,
			getContractKey: vi.fn((contract: any, key: string) => {
				if (key === 'otherPartyNpub') return 'npub1counterparty';
				if (key === 'amount') return contract.contractEvent.content.amount;
				if (key === 'taskTitle' || key === 'contextTitle') {
					return contract.contractEvent.content.contextTitle;
				}
				return contract.contractEvent.content[key];
			})
		},
		sendNotificationToNpubs: vi.fn(),
		showErrorToast: vi.fn()
	};
});

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
			completeTask: vi.fn().mockResolvedValue(undefined),
			acceptTask: vi.fn().mockResolvedValue(undefined),
			disputeTask: vi.fn().mockResolvedValue(undefined),
			proposeResolution: vi.fn().mockResolvedValue(undefined),
			acceptProposal: vi.fn().mockResolvedValue(undefined),
			cancelEscrow: vi.fn().mockResolvedValue(undefined),
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

function buildContract(
	contextType: 'task' | 'service',
	permissions: Partial<Record<string, boolean>> = {}
) {
	return {
		escrowData: { id: `${contextType}-123` },
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
			id: `${contextType}-event-1`,
			content: {
				contextType,
				contextTitle:
					contextType === 'service' ? 'Premium logo package' : 'Landing page redesign',
				taskTitle: 'Landing page redesign',
				amount: '0.01',
				estimatedStartTime: 1_700_000_000,
				estimatedCompletionTime: 1_700_086_400
			}
		},
		disputeProposal: null
	} as any;
}

function setNavigatorOnline(online: boolean) {
	Object.defineProperty(window.navigator, 'onLine', {
		value: online,
		configurable: true
	});
}

describe('task/service contract action parity integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.contractStoreState.set({
			contract: null,
			isDrawerOpen: false,
			isResolutionFormOpen: false
		});
		setNavigatorOnline(true);
		vi.stubEnv('VITE_CLIENT_URL', 'https://bittasker.test');
	});

	it('renders the same shared action bundle with context-aware labels for task and service contracts', () => {
		const permissions = {
			canComplete: true,
			canDispute: true,
			canCancel: true
		};

		const taskView = render(ContractActions, {
			contract: buildContract('task', permissions),
			isInline: false
		});
		const serviceView = render(ContractActions, {
			contract: buildContract('service', permissions),
			isInline: false
		});

		const taskButtons = within(taskView.container).getAllByRole('button');
		const serviceButtons = within(serviceView.container).getAllByRole('button');

		expect(taskButtons).toHaveLength(serviceButtons.length);
		expect(screen.getByRole('button', { name: 'dashboard.contracts.actions.complete_task' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Mark Service Complete' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'dashboard.contracts.actions.dispute_work' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Dispute Service' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'dashboard.contracts.actions.cancel_contract' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Cancel Service Contract' })).toBeInTheDocument();
	});

	it('keeps disabled offline semantics parity-preserving across task and service contracts', async () => {
		const permissions = {
			canComplete: true,
			canDispute: true
		};

		const taskView = render(ContractActions, {
			contract: buildContract('task', permissions),
			isInline: false
		});
		const serviceView = render(ContractActions, {
			contract: buildContract('service', permissions),
			isInline: false
		});

		setNavigatorOnline(false);
		window.dispatchEvent(new Event('offline'));

		await waitFor(() => {
			expect(screen.getAllByTestId('contract-actions-offline-alert')).toHaveLength(2);
		});

		for (const view of [taskView, serviceView]) {
			for (const button of within(view.container).getAllByRole('button')) {
				expect(button).toBeDisabled();
			}
		}
	});
});

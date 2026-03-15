import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';

const EscrowStatus = {
	Funded: 0,
	InDispute: 1,
	Completed: 4,
	Cancelled: 5
} as const;

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$app/environment', () => ({
	browser: false
}));

vi.mock('$lib/i18n/i18n', () => ({
	loadNamespace: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(0)
	}
}));

vi.mock('$lib/api/services/push-notification.service', () => ({
	pushNotificationService: {
		sendNotificationToNpubs: vi.fn()
	}
}));

vi.mock('$lib/utils/escrow', () => ({
	EscrowStatus,
	escrow: {
		escrowOps: {
			loadEscrowDetails: vi.fn(),
			completeTask: vi.fn(),
			acceptTask: vi.fn(),
			disputeTask: vi.fn(),
			proposeResolution: vi.fn(),
			acceptProposal: vi.fn(),
			cancelEscrow: vi.fn(),
			resolveAfterTimelock: vi.fn()
		},
		contractOps: {
			deleteContract: vi.fn()
		}
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn()
	}
}));

vi.mock('$lib/utils/wallet/contractErrorHandler', () => ({
	getErrorMessage: vi.fn((error: Error) => error.message)
}));

vi.mock('$lib/utils/portal', () => ({
	portal: vi.fn()
}));

vi.mock('$lib/utils/location/sendLocation', () => ({
	sendTaskCompletionMessageToTasker: vi.fn(),
	sendPaymentReleasedMessageToTaskee: vi.fn()
}));

vi.mock('$lib/components/ConfirmModal.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/ConfirmModal.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));

vi.mock('$lib/components/contracts/TaskCompletionModal.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/contracts/TaskCompletionModal.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));

vi.mock('$lib/stores/contract.store', () => {
	const value = {
		isResolutionFormOpen: false,
		isDrawerOpen: false,
		contract: null
	};

	return {
		contractStore: {
			subscribe: (run: (state: typeof value) => void) => {
				run(value);
				return () => {};
			},
			getContractKey: (
				contract: { contractEvent: { content: Record<string, string | number | undefined> } },
				key: string
			) => contract.contractEvent.content[key]
		}
	};
});

async function renderContractActions(props: Record<string, unknown>) {
	const { default: ContractActions } = await import('$lib/components/contracts/ContractActions.svelte');

	return render(ContractActions, props);
}

describe('ContractActions BSC fail-closed guards', () => {
	const baseContract = {
		contractEvent: {
			id: 'contract-event-1',
			pubkey: 'client-pubkey',
			created_at: 1_700_000_000,
			content: {
				taskTitle: 'Contract title',
				taskDescription: 'Contract description',
				amount: '125.5',
				taskId: 'task-1',
				clientPubkey: 'client-pubkey',
				otherPartyNpub: 'freelancer-pubkey',
				estimatedStartTime: 1_700_000_100,
				estimatedCompletionTime: 1_700_000_200
			}
		},
		statusEvents: [],
		isClient: true,
		blockchainStatus: null,
		escrowData: { id: 'escrow-1', status: EscrowStatus.Funded },
		status: EscrowStatus.Funded,
		isPending: false,
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

	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it(
		'shows a legacy missing-context blocked alert instead of contract-changing actions',
		async () => {
		await renderContractActions({
			contract: baseContract
		});

		expect(
			screen.getByText(/Legacy escrow actions are unavailable until the rail context is normalized safely\./)
		).toBeInTheDocument();
		expect(screen.queryByText('dashboard.contracts.actions.accept_work')).not.toBeInTheDocument();
		},
		30000
	);

	it(
		'shows a BSC pre-ABI blocked alert for metadata-only BSC contracts',
		async () => {
		await renderContractActions({
			contract: {
				...baseContract,
				contractEvent: {
					...baseContract.contractEvent,
					content: {
						...baseContract.contractEvent.content,
						paymentNetwork: 'bsc-testnet'
					}
				}
			}
		});

		expect(
			screen.getByText(
				/USDT on BSC escrow actions are unavailable in read-only mode until the deployed BSC escrow ABI\/artifacts are accepted\./
			)
		).toBeInTheDocument();
		expect(screen.queryByText('dashboard.contracts.actions.accept_work')).not.toBeInTheDocument();
		},
		30000
	);
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TaskCompletionModal from '$lib/components/contracts/TaskCompletionModal.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/components/MediaUploader.svelte', () => ({
	default: vi.fn()
}));

vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		deleteFile: vi.fn()
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn()
	}
}));

vi.mock('$lib/stores/task.store', async () => {
	const { readable } = await import('svelte/store');

	return {
		TASKS_PER_PAGE: 20,
		tasksStore: readable({ items: [] }),
		myTasksStore: readable({ items: [] }),
		taskStore: readable({})
	};
});

vi.mock('$lib/utils/helpers/currencyFormatter', () => ({
	formatUSDWithSatsSync: vi.fn(() => '$125.00 • 12,500 sats')
}));

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		getContractKey: (_contract: { contractEvent: { content: Record<string, string> } }, key: string) =>
			_contract.contractEvent.content[key]
	}
}));

describe('TaskCompletionModal BSC rail fallback', () => {
	const baseContract = {
		contractEvent: {
			content: {
				taskTitle: 'Legacy contract',
				amount: '125.5',
				currency: 'RBTC'
			}
		},
		statusEvents: [],
		isClient: false,
		blockchainStatus: EscrowStatus.Funded,
		escrowData: { id: 'escrow-1' },
		status: EscrowStatus.Funded,
		isPending: false,
		permissions: {
			canComplete: true,
			canAccept: false,
			canDispute: false,
			canPropose: false,
			canAcceptProposal: false,
			canCancel: false,
			canResolveTimelock: false,
			canDelete: false
		},
		disputeProposal: null,
		completionAttachments: null
	};

	it('fails closed when the completion modal lacks explicit rail context', () => {
		render(TaskCompletionModal, {
			contract: baseContract,
			isOpen: true,
			onClose: vi.fn(),
			onComplete: vi.fn()
		});

		expect(screen.getByText('125.5')).toBeInTheDocument();
		expect(screen.getByText('(Escrow amount)')).toBeInTheDocument();
		expect(screen.queryByText(/RBTC$/)).not.toBeInTheDocument();
		expect(screen.queryByText(/Rootstock/)).not.toBeInTheDocument();
	});

	it('shows the explicit BSC rail label for USDT contracts with network metadata', () => {
		render(TaskCompletionModal, {
			contract: {
				...baseContract,
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						amount: '12.5',
						paymentAsset: 'USDT',
						paymentNetwork: 'bsc-testnet',
						currency: 'USDT'
					}
				}
			},
			isOpen: true,
			onClose: vi.fn(),
			onComplete: vi.fn()
		});

		expect(screen.getByText('12.5 USDT')).toBeInTheDocument();
		expect(screen.getByText('(USDT on BSC)')).toBeInTheDocument();
	});

	it('fails closed for metadata-only BSC contracts with missing asset context', () => {
		render(TaskCompletionModal, {
			contract: {
				...baseContract,
				blockchainStatus: null,
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						paymentNetwork: 'bsc-testnet'
					}
				}
			},
			isOpen: true,
			onClose: vi.fn(),
			onComplete: vi.fn()
		});

		expect(screen.getByText('125.5')).toBeInTheDocument();
		expect(screen.getByText('(BSC escrow)')).toBeInTheDocument();
		expect(screen.queryByText(/RBTC on BSC/)).not.toBeInTheDocument();
		expect(screen.queryByText(/\$125\.00 • 12,500 sats/)).not.toBeInTheDocument();
		expect(screen.queryByText(/RBTC$/)).not.toBeInTheDocument();
	});

	it('infers USDT on BSC for confirmed contracts with legacy network-only metadata', () => {
		render(TaskCompletionModal, {
			contract: {
				...baseContract,
				blockchainStatus: 'funded',
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						amount: '12.5',
						paymentNetwork: 'bsc-testnet'
					}
				}
			},
			isOpen: true,
			onClose: vi.fn(),
			onComplete: vi.fn()
		});

		expect(screen.getByText('12.5 USDT')).toBeInTheDocument();
		expect(screen.getByText('(USDT on BSC)')).toBeInTheDocument();
		expect(screen.queryByText('(BSC escrow)')).not.toBeInTheDocument();
		expect(screen.queryByText(/\$125\.00 • 12,500 sats/)).not.toBeInTheDocument();
	});
});

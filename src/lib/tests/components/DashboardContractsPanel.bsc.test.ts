import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { EscrowStatus } from '$lib/utils/escrow';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

const contractStoreState = {
	contracts: [
		{
			contractEvent: {
				content: {
					taskTitle: 'Metadata-only BSC contract',
					taskDescription: 'Legacy BSC description',
					paymentNetwork: 'bsc-testnet'
				}
			},
			blockchainStatus: null,
			escrowData: { id: 'escrow-1' },
			status: EscrowStatus.Funded,
			isClient: true
		}
	],
	hasMore: false,
	isLoading: false,
	isLoadingMore: false,
	error: null
};

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		subscribe: (run: (value: typeof contractStoreState) => void) => {
			run(contractStoreState);
			return () => {};
		},
		loadContracts: vi.fn().mockResolvedValue(undefined),
		loadMoreContracts: vi.fn().mockResolvedValue(undefined),
		unsubscribeFromStatusUpdates: vi.fn(),
		unsubscribeFromNewContracts: vi.fn()
	}
}));

vi.mock('$lib/stores/task.store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/task.store')>();

	return {
		...actual,
		tasksStore: readable({ items: [] }),
		myTasksStore: readable({ items: [] })
	};
});

vi.mock('$lib/stores/infiniteScroll.store', () => ({
	scroll: {
		update: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/task-status-reconciliation', () => ({
	reconcileTaskStatusWithContracts: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: vi.fn().mockResolvedValue(60000)
	}
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: readable({
		isConnected: true,
		rsk: {
			wallet: {},
			provider: {}
		}
	}),
	walletManager: {
		initialize: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/components/contracts/ContractCard.svelte', async () => ({
	default: (await import('./stubs/ContractActionsStub.svelte')).default
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/contracts/ContractCard.svelte', async () => ({
	default: (await import('./stubs/ContractActionsStub.svelte')).default
}));

vi.mock('$lib/components/contracts/ContractDrawer.svelte', async () => ({
	default: (await import('./stubs/ContractActionsStub.svelte')).default
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/contracts/ContractDrawer.svelte', async () => ({
	default: (await import('./stubs/ContractActionsStub.svelte')).default
}));

vi.mock('$lib/components/InfiniteScroll.svelte', async () => ({
	default: (await import('./stubs/ContractActionsStub.svelte')).default
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/InfiniteScroll.svelte', async () => ({
	default: (await import('./stubs/ContractActionsStub.svelte')).default
}));

async function renderDashboardContractsPanel() {
	const { default: DashboardContractsPanel } = await import(
		'$lib/components/contracts/DashboardContractsPanel.svelte'
	);

	return render(DashboardContractsPanel);
}

describe('DashboardContractsPanel BSC pre-ABI banner', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	it(
		'shows the BSC read-only pre-ABI banner for metadata-only BSC contracts',
		async () => {
			await renderDashboardContractsPanel();

			expect(
				await screen.findByText(
					/1 contract is showing BSC escrow in read-only pre-ABI mode\./i
				)
			).toBeInTheDocument();
			expect(
				screen.getByText(
					/details remain visible, but contract-changing actions stay blocked until the deployed BSC escrow ABI\/artifacts are accepted\./i
				)
			).toBeInTheDocument();
		},
		15000
	);
});

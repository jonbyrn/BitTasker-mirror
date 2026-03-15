import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('$lib/components/Drawer.svelte', async () => ({
	default: (await import('./stubs/DrawerStub.svelte')).default
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/Drawer.svelte', async () => ({
	default: (await import('./stubs/DrawerStub.svelte')).default
}));

vi.mock('$lib/components/contracts/ContractTimeline.svelte', async () => ({
	default: (await import('./stubs/TimelinePropsStub.svelte')).default
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/contracts/ContractTimeline.svelte', async () => ({
	default: (await import('./stubs/TimelinePropsStub.svelte')).default
}));

vi.mock('$lib/components/contracts/ContractActions.svelte', async () => ({
	default: (await import('./stubs/ContractActionsStub.svelte')).default
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/contracts/ContractActions.svelte', async () => ({
	default: (await import('./stubs/ContractActionsStub.svelte')).default
}));

vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));
vi.mock('$lib/components/shared/UsdSatsDisplay.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));
vi.mock('$lib/components/Gallery.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));
vi.mock('$lib/components/user/UserInfoDisplay.svelte', async () => ({
	default: (await import('./stubs/EmptyStub.svelte')).default
}));

vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getStatusTranslationKey: vi.fn(() => 'dashboard.contracts.status.funded'),
	getStatusColorClass: vi.fn(() => 'badge-info')
}));

const contractStoreState = {
	contract: null as
		| {
				contractEvent: {
					id: string;
					pubkey: string;
					created_at: number;
					content: Record<string, string | number | undefined>;
				};
				statusEvents: unknown[];
				isClient: boolean;
				blockchainStatus: string | null;
				escrowData: { id: string };
				status: EscrowStatus;
				isPending: boolean;
				permissions: Record<string, boolean>;
		  }
		| null,
	isDrawerOpen: true
};

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		subscribe: (run: (value: typeof contractStoreState) => void) => {
			run(contractStoreState);
			return () => {};
		},
		getContractKey: (
			contract: { contractEvent: { content: Record<string, string | number | undefined> } },
			key: string
		) => contract.contractEvent.content[key]
	}
}));

async function renderContractDrawer() {
	const { default: ContractDrawer } = await import('$lib/components/contracts/ContractDrawer.svelte');

	return render(ContractDrawer, { btcPrice: 65000 });
}

describe('ContractDrawer BSC fail-closed rendering', () => {
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
				freelancerPubkey: 'freelancer-pubkey',
				otherPartyNpub: 'freelancer-pubkey',
				estimatedStartTime: 1_700_000_100,
				estimatedCompletionTime: 1_700_000_200
			}
		},
		statusEvents: [],
		isClient: true,
		blockchainStatus: null,
		escrowData: { id: 'escrow-1' },
		status: EscrowStatus.Funded,
		isPending: false,
		permissions: {
			canComplete: false,
			canAccept: false,
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
		contractStoreState.isDrawerOpen = true;
	});

	it('fails closed for legacy contracts with no explicit rail context', async () => {
		contractStoreState.contract = baseContract;

		await renderContractDrawer();

		expect(screen.getByText('Legacy escrow')).toBeInTheDocument();
		expect(screen.getByText('Read-only')).toBeInTheDocument();
		expect(screen.getAllByText('Missing rail context').length).toBeGreaterThan(0);
		expect(
			screen.getByText(
				/This legacy contract is readable, but contract-changing actions stay blocked until the rail context is normalized safely\./
			)
		).toBeInTheDocument();
		expect(screen.queryByTestId('contract-actions-stub')).not.toBeInTheDocument();
		expect(screen.getByTestId('timeline-props')).toHaveTextContent('undefined|undefined');
	});

	it('keeps metadata-only BSC contracts readable while withholding inferred asset context from the timeline', async () => {
		contractStoreState.contract = {
			...baseContract,
			contractEvent: {
				...baseContract.contractEvent,
				content: {
					...baseContract.contractEvent.content,
					currency: 'USD',
					paymentNetwork: 'bsc-testnet'
				}
			}
		};

		await renderContractDrawer();

		expect(screen.getByText('BSC escrow')).toBeInTheDocument();
		expect(screen.getByText('Read-only')).toBeInTheDocument();
		expect(screen.getByText('BSC escrow legacy context')).toBeInTheDocument();
		expect(
			screen.getByText(/Payment asset context is legacy or missing, so RBTC\/sats display is intentionally suppressed/i)
		).toBeInTheDocument();
		expect(screen.getByTestId('contract-actions-stub')).toBeInTheDocument();
		expect(screen.getByTestId('timeline-props')).toHaveTextContent('undefined|bsc-testnet');
	});

	it('infers USDT on BSC for confirmed contracts with legacy network-only metadata', async () => {
		contractStoreState.contract = {
			...baseContract,
			blockchainStatus: 'funded',
			contractEvent: {
				...baseContract.contractEvent,
				content: {
					...baseContract.contractEvent.content,
					amount: '12.5',
					currency: 'USD',
					paymentNetwork: 'bsc-testnet'
				}
			}
		};

		await renderContractDrawer();

		expect(screen.getAllByText('USDT on BSC').length).toBeGreaterThan(0);
		expect(screen.getByText('12.5 USDT')).toBeInTheDocument();
		expect(screen.queryByText('BSC escrow legacy context')).toBeNull();
		expect(
			screen.queryByText(/Payment asset context is legacy or missing, so RBTC\/sats display is intentionally suppressed/i)
		).toBeNull();
		expect(screen.getByTestId('timeline-props')).toHaveTextContent('USDT|bsc-testnet');
	});
});

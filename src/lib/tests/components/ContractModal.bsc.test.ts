import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { EscrowStatus } from '$lib/utils/escrow';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');

	return {
		t: readable((key: string) => key),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/helpers/dateFormatter', () => ({
	formatStandardDateTime: vi.fn(() => 'formatted-date')
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

vi.mock('$lib/stores/contract.store', () => ({
	contractStore: {
		getContractKey: (
			contract: { contractEvent: { content: Record<string, string | number | undefined> } },
			key: string
		) => contract.contractEvent.content[key]
	}
}));

async function renderContractModal(props: Record<string, unknown>) {
	const { default: ContractModal } = await import('$lib/components/contracts/ContractModal.svelte');

	return render(ContractModal, props);
}

describe('ContractModal BSC timeline rail handoff', () => {
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
	});

	it('keeps metadata-only BSC contracts readable while withholding inferred asset context from the timeline', async () => {
		await renderContractModal({
			contract: {
				...baseContract,
				contractEvent: {
					...baseContract.contractEvent,
					content: {
						...baseContract.contractEvent.content,
						currency: 'USD',
						paymentNetwork: 'bsc-testnet'
					}
				}
			},
			isOpen: true,
			onClose: vi.fn(),
			onUpdate: vi.fn()
		});

		expect(screen.getByText('Read-only')).toBeInTheDocument();
		expect(screen.getByText('BSC escrow')).toBeInTheDocument();
		expect(
			screen.getByText(/Payment asset context is legacy or missing, so RBTC display is intentionally suppressed/i)
		).toBeInTheDocument();
		expect(screen.getByTestId('timeline-props')).toHaveTextContent('undefined|bsc-testnet');
	});

	it('fails closed for legacy contracts with no explicit rail context', async () => {
		await renderContractModal({
			contract: baseContract,
			isOpen: true,
			onClose: vi.fn(),
			onUpdate: vi.fn()
		});

		expect(screen.getByText('Legacy escrow')).toBeInTheDocument();
		expect(screen.getByText('Read-only')).toBeInTheDocument();
		expect(screen.getByText('Missing rail context')).toBeInTheDocument();
		expect(
			screen.getByText(
				/This legacy contract is readable, but contract-changing actions stay blocked until the rail context is normalized safely\./
			)
		).toBeInTheDocument();
		expect(screen.getByTestId('timeline-props')).toHaveTextContent('undefined|undefined');
	});

	it('passes explicit BSC USDT rail context through to the timeline when the contract metadata is explicit', async () => {
		await renderContractModal({
			contract: {
				...baseContract,
				contractEvent: {
					...baseContract.contractEvent,
					content: {
						...baseContract.contractEvent.content,
						amount: '12.5',
						currency: 'USDT',
						paymentAsset: 'USDT',
						paymentNetwork: 'bsc-testnet'
					}
				}
			},
			isOpen: true,
			onClose: vi.fn(),
			onUpdate: vi.fn()
		});

		expect(screen.getByText('12.5 USDT')).toBeInTheDocument();
		expect(screen.getByText('USDT on BSC')).toBeInTheDocument();
		expect(
			screen.getByText(/USDT on BSC escrow details are available in read-only mode/i)
		).toBeInTheDocument();
		expect(screen.getByTestId('timeline-props')).toHaveTextContent('USDT|bsc-testnet');
	});

	it('infers USDT on BSC for confirmed contracts with legacy network-only metadata', async () => {
		await renderContractModal({
			contract: {
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
			},
			isOpen: true,
			onClose: vi.fn(),
			onUpdate: vi.fn()
		});

		expect(screen.getByText('12.5 USDT')).toBeInTheDocument();
		expect(screen.getByText('USDT on BSC')).toBeInTheDocument();
		expect(screen.queryByText('Read-only')).toBeNull();
		expect(
			screen.queryByText(/Payment asset context is legacy or missing, so RBTC display is intentionally suppressed/i)
		).toBeNull();
		expect(screen.getByTestId('timeline-props')).toHaveTextContent('USDT|bsc-testnet');
	});
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ContractCard from '$lib/components/contracts/ContractCard.svelte';
import { EscrowStatus } from '$lib/utils/escrow';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'dashboard.client': 'Client',
		'dashboard.freelancer': 'Freelancer',
		'dashboard.contracts.view_details': 'View details'
	};

	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/helpers/contractStatusFormatter', () => ({
	getStatusTranslationKey: vi.fn(() => 'dashboard.contracts.status.funded'),
	getStatusColorClass: vi.fn(() => 'badge-info')
}));

vi.mock('$lib/components/contracts/ContractActions.svelte', () => ({
	default: () => null
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/contracts/ContractActions.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/UserNostrBadge.svelte', () => ({
	default: () => null
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/UserNostrBadge.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: () => null
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/task/TaskDeadlineDisplay.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/task/TaskLocationDisplay.svelte', () => ({
	default: () => null
}));
vi.mock('/home/scott/USDT/BitTasker/src/lib/components/task/TaskLocationDisplay.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/stores/contract.store', () => {
	const value = {
		contract: null,
		isDrawerOpen: false
	};

	return {
		contractStore: {
			subscribe: (run: (value: typeof value) => void) => {
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

describe('ContractCard BSC fail-closed rendering', () => {
	const baseContract = {
		contractEvent: {
			content: {
				taskTitle: 'Contract title',
				taskDescription: 'Contract description',
				amount: '125.5',
				estimatedCompletionTime: 1_700_000_000,
				otherPartyNpub: 'npub1test'
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

	it('fails closed for metadata-only BSC contracts even when a stale legacy currency field is present', () => {
		render(ContractCard, {
			contract: {
				...baseContract,
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						currency: 'USD',
						paymentNetwork: 'bsc-testnet'
					}
				}
			},
			btcPrice: 65000
		});

		expect(screen.getByText('BSC escrow')).toBeInTheDocument();
		expect(screen.getByText('Read-only pre-ABI')).toBeInTheDocument();
		expect(screen.getAllByText('Read-only')).toHaveLength(1);
		expect(screen.getByText('BSC escrow legacy context')).toBeInTheDocument();
		expect(
			screen.getByText(
				/RBTC\/sats display is intentionally suppressed until the record is normalized safely\./
			)
		).toBeInTheDocument();
		expect(screen.queryByText('$8,157,500.00')).not.toBeInTheDocument();
		expect(screen.queryByText('12,550,000,000 Sats')).not.toBeInTheDocument();
		expect(screen.queryByText('125.5000 RBTC')).not.toBeInTheDocument();
	});

	it('marks missing-network legacy contracts as readable but non-actionable', () => {
		render(ContractCard, {
			contract: baseContract,
			btcPrice: 65000
		});

		expect(screen.getByText('Legacy escrow')).toBeInTheDocument();
		expect(screen.getAllByText('Missing rail context')).toHaveLength(2);
		expect(screen.getAllByText('Read-only')).toHaveLength(1);
		expect(
			screen.getByText(
				/This legacy contract is readable, but contract-changing actions stay blocked until the rail context is normalized safely\./
			)
		).toBeInTheDocument();
		expect(screen.queryByText('125.5000 RBTC')).not.toBeInTheDocument();
	});

	it('renders confirmed legacy BSC contracts with network-only metadata as USDT on BSC', () => {
		render(ContractCard, {
			contract: {
				...baseContract,
				blockchainStatus: 'funded',
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						currency: 'USD',
						paymentNetwork: 'bsc-testnet'
					}
				}
			},
			btcPrice: 65000
		});

		expect(screen.getAllByText('USDT on BSC').length).toBeGreaterThan(0);
		expect(screen.getByText('125.5 USDT')).toBeInTheDocument();
		expect(screen.queryByText('BSC escrow legacy context')).toBeNull();
		expect(screen.queryByText('Read-only pre-ABI')).toBeNull();
		expect(screen.queryByText('$8,157,500.00')).toBeNull();
		expect(screen.queryByText('12,550,000,000 Sats')).toBeNull();
	});

	it('displays USDT on mainnet BSC with correct network badge', () => {
		render(ContractCard, {
			contract: {
				...baseContract,
				blockchainStatus: 'funded',
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						paymentNetwork: 'bsc-mainnet'
					}
				}
			},
			btcPrice: 65000
		});

		expect(screen.getAllByText('USDT on BSC').length).toBeGreaterThan(0);
		expect(screen.getByText('125.5 USDT')).toBeInTheDocument();
	});

	it('preserves amount precision for USDT on BSC contracts', () => {
		render(ContractCard, {
			contract: {
				...baseContract,
				blockchainStatus: 'funded',
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						amount: '999.999999',
						paymentNetwork: 'bsc-mainnet'
					}
				}
			},
			btcPrice: 65000
		});

		// USDT with 6 decimal places should display correctly
		expect(screen.getByText(/999\.999999|999\.99/)).toBeInTheDocument();
	});

	it('handles zero-balance USDT contracts gracefully', () => {
		render(ContractCard, {
			contract: {
				...baseContract,
				blockchainStatus: 'funded',
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						amount: '0.000001',
						paymentNetwork: 'bsc-mainnet'
					}
				}
			},
			btcPrice: 65000
		});

		expect(screen.getAllByText(/USDT on BSC|0\.000001/).length).toBeGreaterThan(0);
	});

	it('does not attempt to show satoshi conversion for BSC contracts', () => {
		render(ContractCard, {
			contract: {
				...baseContract,
				blockchainStatus: 'funded',
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						amount: '100',
						paymentNetwork: 'bsc-mainnet'
					}
				}
			},
			btcPrice: 65000
		});

		// Should NOT show sats conversion for BSC USDT
		expect(screen.queryByText(/\d+\s*Sats/)).not.toBeInTheDocument();
		expect(screen.getByText('100 USDT')).toBeInTheDocument();
	});

	it('shows read-only state for unfunded BSC contracts with metadata only', () => {
		render(ContractCard, {
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
			btcPrice: 65000
		});

		expect(screen.getByText(/BSC escrow|Read-only/)).toBeInTheDocument();
	});

	it('correctly identifies BSC testnet vs mainnet from paymentNetwork field', () => {
		const { unmount } = render(ContractCard, {
			contract: {
				...baseContract,
				blockchainStatus: 'funded',
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						paymentNetwork: 'bsc-testnet'
					}
				}
			},
			btcPrice: 65000
		});

		expect(screen.getAllByText('USDT on BSC').length).toBeGreaterThan(0);
		unmount();

		// Now test with mainnet
		render(ContractCard, {
			contract: {
				...baseContract,
				blockchainStatus: 'funded',
				contractEvent: {
					content: {
						...baseContract.contractEvent.content,
						paymentNetwork: 'bsc-mainnet'
					}
				}
			},
			btcPrice: 65000
		});

		expect(screen.getAllByText('USDT on BSC').length).toBeGreaterThan(0);
	});
});

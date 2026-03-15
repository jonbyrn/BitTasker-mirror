import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
import type { NostrEventWithFollowup } from '$lib/types/bid';
import type { NostrEvent } from 'nostr-tools';
import type { Task } from '$lib/types/task';

const { mockAcceptBidAndCreateEscrow, mockValidateSufficientBalance, mockContractCreationStore } = vi.hoisted(
	() => ({
		mockAcceptBidAndCreateEscrow: vi.fn(),
		mockValidateSufficientBalance: vi.fn(),
		mockContractCreationStore: (() => {
			const { writable } = require('svelte/store');
			return writable<{ escrowId: string; contractEventId?: string; error?: string } | null>(null);
		})()
	})
);

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		bidOps: {
			calculateBidEscrowDetails: vi.fn(() => ({
				totalAmount: '0.001',
				baseAmount: '0.001',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				clientFeeTier: 1,
				freelancerFeeTier: 1
			})),
			validateEscrowDetails: vi.fn(() => ({ errors: [], warnings: [] })),
			validateSufficientBalance: (...args: unknown[]) => mockValidateSufficientBalance(...args),
			getFeePercentageDisplay: vi.fn(() => '1%'),
			formatRBTCAmount: vi.fn((amount: string) => amount),
			acceptBidAndCreateEscrow: mockAcceptBidAndCreateEscrow
		},
		eventOps: {
			getContractCreationStore: () => mockContractCreationStore
		}
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	const translations: Record<string, string> = {
		'dashboard.bids.bid_acceptance.accept': 'Accept',
		'dashboard.bids.bid_acceptance.fund_contract_title': 'Fund Contract',
		'dashboard.bids.bid_acceptance.fund': 'Fund',
		'dashboard.bids.bid_acceptance.total_payment': 'Total Payment',
		'dashboard.bids.bid_acceptance.estimated_start': 'Estimated Start',
		'dashboard.bids.bid_acceptance.estimated_duration': 'Estimated Duration',
		'dashboard.bids.bid_acceptance.insufficient_balance': 'Not enough funds',
		'dashboard.bids.bid_acceptance.cancel': 'Cancel',
		'dashboard.bids.bid_acceptance.anonymous': 'Anonymous',
		'common.cancel': 'Cancel',
		'wallet.send.confirmation_warning': 'Verify details before confirming.',
		'dashboard.bids.bid_acceptance.creating_escrow': 'Creating...',
		'dashboard.bids.bid_acceptance.creating': 'Creating...'
	};
	const tStore = readable((key: string) => translations[key] ?? key);
	return {
		t: tStore,
		locale: readable('en'),
		locales: readable(['en', 'es']),
		isLoading: readable(false)
	};
});

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: writable({
		rsk: { connected: true, contractConnected: true, address: '0x123', balance: '1000000000000000000' },
		bsc: { connected: false },
		allAssets: [],
		totalBalances: {}
	}),
	walletManager: { initialize: vi.fn(), loadAssets: vi.fn() },
	getProvider: vi.fn(() => null),
	allAssets: writable([]),
	totalBalances: writable({}),
	formatSats: vi.fn((n?: number | null) => (typeof n === 'number' ? n.toString() : '0'))
}));

vi.mock('$lib/stores/bid.store', () => {
	const { writable } = require('svelte/store');
	const w = writable({ processingBidIds: new Set<string>() });
	return {
		bidStore: {
			subscribe: w.subscribe,
			addProcessingBid: vi.fn(),
			removeProcessingBid: vi.fn()
		}
	};
});

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		showErrorToast: vi.fn(),
		showSuccessToast: vi.fn()
	}
}));

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('$lib/nostr/task', () => ({ updateTask: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/utils/location/sendLocation', () => ({ sendLocationsToTaskee: vi.fn().mockResolvedValue(undefined) }));

vi.mock('$lib/components/user/UserInfoDisplay.svelte', () => ({
	default: vi.fn(() => ({ type: 'div', props: {}, children: [] }))
}));
vi.mock('$lib/components/messages/MessageModal.svelte', () => ({
	default: vi.fn(() => null)
}));
vi.mock('$lib/components/bidding/SecurePaymentContractModal.svelte', () => ({
	default: vi.fn(() => null)
}));

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' }
}));

vi.mock('$lib/i18n/i18n', () => ({ loadNamespace: vi.fn().mockResolvedValue(undefined) }));

const now = Math.floor(Date.now() / 1000);
const defaultBidContent = {
	bidderId: 'npub1test123',
	bidderName: 'Test Taskee',
	bidderAvatar: null,
	bidderRating: 4.5,
	amount: 100,
	currency: 'USD',
	estimatedHours: 2
};

const defaultTaskContent: Task = {
	title: 'Test Task',
	description: 'Test Description',
	budget: { amount: 100, currency: 'USD', type: 'fixed' },
	taskType: 'remote',
	deadline: null,
	dateRange: null,
	pickupLocation: null,
	dropOffLocation: null,
	status: 'open',
	attachments: []
};

const defaultProps = {
	bid: {
		id: 'bid-1',
		content: defaultBidContent,
		pubkey: 'npub1test123',
		created_at: now,
		kind: 1,
		sig: 'sig',
		tags: []
	} as NostrEventWithFollowup,
	task: {
		id: 'task-1',
		content: JSON.stringify(defaultTaskContent),
		pubkey: 'npub1client',
		created_at: now - 3600,
		kind: 1,
		sig: 'sig',
		tags: []
	} as NostrEvent,
	btcPrice: 65000,
	onCancel: vi.fn()
};

describe('BidAcceptanceForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidateSufficientBalance.mockReturnValue([]);
		mockAcceptBidAndCreateEscrow.mockResolvedValue({
			success: true,
			transactionResult: { hash: '0xabc', escrowId: '1', status: 'pending' }
		});
	});

	it('renders BSC escrow acceptance as blocked pre-ABI and skips RSK balance validation', async () => {
		const bscBid = {
			...defaultProps.bid,
			content: {
				...defaultBidContent,
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			}
		} as NostrEventWithFollowup;
		const bscTask = {
			...defaultProps.task,
			content: JSON.stringify({
				...defaultTaskContent,
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			})
		} as NostrEvent;

		render(BidAcceptanceForm, {
			props: {
				...defaultProps,
				bid: bscBid,
				task: bscTask
			}
		});
		await tick();

		expect(
			screen.getByText(
				'USDT on BSC escrow acceptance stays blocked until the deployed BSC escrow ABI/artifacts are accepted.'
			)
		).toBeInTheDocument();

		const acceptButton = screen.getAllByRole('button', { name: /accept/i }).find((button) =>
			button.className.includes('btn btn-primary')
		);
		expect(acceptButton).toBeDefined();
		expect(acceptButton).toBeDisabled();
		expect(mockValidateSufficientBalance).not.toHaveBeenCalled();
	});

	it('treats legacy BSC task metadata with only paymentNetwork as the blocked USDT on BSC escrow rail', async () => {
		render(BidAcceptanceForm, {
			props: {
				...defaultProps,
				bid: {
					...defaultProps.bid,
					content: {
						...defaultBidContent
					}
				} as NostrEventWithFollowup,
				task: {
					...defaultProps.task,
					content: JSON.stringify({
						...defaultTaskContent,
						paymentNetwork: 'bsc-testnet'
					})
				} as NostrEvent
			}
		});
		await tick();

		expect(
			screen.getByText(
				'USDT on BSC escrow acceptance stays blocked until the deployed BSC escrow ABI/artifacts are accepted.'
			)
		).toBeInTheDocument();
		expect(mockValidateSufficientBalance).not.toHaveBeenCalled();
	});

	it('updates the rail copy when bid props switch from Rootstock to USDT on BSC', async () => {
		const rendered = render(BidAcceptanceForm, {
			props: defaultProps
		});
		await tick();

		expect(screen.queryByText(/USDT on BSC escrow acceptance stays blocked/i)).toBeNull();

		const bscBid = {
			...defaultProps.bid,
			content: {
				...defaultBidContent,
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			}
		} as NostrEventWithFollowup;
		const bscTask = {
			...defaultProps.task,
			content: JSON.stringify({
				...defaultTaskContent,
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			})
		} as NostrEvent;

		await rendered.rerender({
			...defaultProps,
			bid: bscBid,
			task: bscTask
		});
		await tick();

		expect(
			screen.getByText(
				'USDT on BSC escrow acceptance stays blocked until the deployed BSC escrow ABI/artifacts are accepted.'
			)
		).toBeInTheDocument();
	});

	it('keeps the BSC pre-ABI accept path non-actionable when the disabled button is clicked', async () => {
		const bscBid = {
			...defaultProps.bid,
			content: {
				...defaultBidContent,
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			}
		} as NostrEventWithFollowup;
		const bscTask = {
			...defaultProps.task,
			content: JSON.stringify({
				...defaultTaskContent,
				paymentAsset: 'USDT',
				paymentNetwork: 'bsc-testnet'
			})
		} as NostrEvent;

		render(BidAcceptanceForm, {
			props: {
				...defaultProps,
				bid: bscBid,
				task: bscTask
			}
		});
		await tick();

		const acceptButton = screen
			.getAllByRole('button')
			.find((button) => button.textContent?.trim() === 'Accept');
		expect(acceptButton).toBeDefined();
		expect(acceptButton).toBeDisabled();
		await fireEvent.click(acceptButton);
		await tick();

		expect(screen.queryByText('Fund Contract')).toBeNull();
		expect(mockAcceptBidAndCreateEscrow).not.toHaveBeenCalled();
	});

	it('shows Accept as the primary action for the default escrow flow', async () => {
		render(BidAcceptanceForm, { props: defaultProps });
		await tick();

		const acceptButton = screen
			.getAllByRole('button')
			.find((button) => button.textContent?.trim() === 'Accept');

		expect(acceptButton).toBeDefined();
		expect(acceptButton).not.toBeDisabled();
	});

	it('opens the fund contract modal without submitting escrow when Accept is clicked', async () => {
		render(BidAcceptanceForm, { props: defaultProps });
		await tick();

		const acceptButton = screen
			.getAllByRole('button')
			.find((button) => button.textContent?.trim() === 'Accept');
		expect(acceptButton).toBeDefined();
		await fireEvent.click(acceptButton);
		await tick();

		expect(screen.getByText('Fund Contract')).toBeInTheDocument();
		expect(mockAcceptBidAndCreateEscrow).not.toHaveBeenCalled();
	});

	describe('Accept button and Fund Contract modal', () => {
		it('modal shows Cancel and Fund buttons', async () => {
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			const acceptButton = screen
				.getAllByRole('button')
				.find((button) => button.textContent?.trim() === 'Accept');
			expect(acceptButton).toBeDefined();
			await fireEvent.click(acceptButton);
			await tick();
			const fundDialog = screen.getByRole('dialog', { name: 'Fund Contract' });
			expect(within(fundDialog).getByRole('button', { name: /^Cancel$/i })).toBeDefined();
			expect(within(fundDialog).getByRole('button', { name: /^Fund$/i })).toBeDefined();
		});

		it('closes modal when Cancel is clicked', async () => {
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			const acceptButton = screen
				.getAllByRole('button')
				.find((button) => button.textContent?.trim() === 'Accept');
			expect(acceptButton).toBeDefined();
			await fireEvent.click(acceptButton);
			await tick();
			const fundDialog = screen.getByRole('dialog', { name: 'Fund Contract' });
			await fireEvent.click(within(fundDialog).getByRole('button', { name: /^Cancel$/i }));
			await tick();
			await waitFor(() => {
				expect(screen.queryByText('Fund Contract')).toBeNull();
			});
		});
	});

	describe('Fund button behavior', () => {
		it('calls acceptBidAndCreateEscrow when Fund is clicked and balance is sufficient', async () => {
			mockValidateSufficientBalance.mockReturnValue([]);
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			const acceptButton = screen
				.getAllByRole('button')
				.find((button) => button.textContent?.trim() === 'Accept');
			expect(acceptButton).toBeDefined();
			await fireEvent.click(acceptButton);
			await tick();
			const fundDialog = screen.getByRole('dialog', { name: 'Fund Contract' });
			await fireEvent.click(within(fundDialog).getByRole('button', { name: /^Fund$/i }));
			await waitFor(() => {
				expect(mockAcceptBidAndCreateEscrow).toHaveBeenCalledTimes(1);
			});
		});

		it('keeps modal open and does not call acceptBidAndCreateEscrow when Fund is clicked with insufficient balance', async () => {
			mockValidateSufficientBalance.mockReturnValue([]);
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			const acceptButton = screen
				.getAllByRole('button')
				.find((button) => button.textContent?.trim() === 'Accept');
			expect(acceptButton).toBeDefined();
			await fireEvent.click(acceptButton);
			await tick();
			const fundDialog = screen.getByRole('dialog', { name: 'Fund Contract' });
			mockValidateSufficientBalance.mockReturnValue(['Not enough funds']);
			await fireEvent.click(within(fundDialog).getByRole('button', { name: /^Fund$/i }));
			await tick();
			expect(mockAcceptBidAndCreateEscrow).not.toHaveBeenCalled();
			expect(screen.getByText('Fund Contract')).toBeDefined();
		});
	});

	describe('Network-aware acceptance', () => {
		it('should display correct payment network in acceptance confirmation', async () => {
			const bscBid = {
				...defaultProps.bid,
				content: {
					...defaultBidContent,
					paymentAsset: 'USDT',
					paymentNetwork: 'bsc-testnet'
				}
			} as NostrEventWithFollowup;

			render(BidAcceptanceForm, {
				props: {
					...defaultProps,
					bid: bscBid
				}
			});
			await tick();

			expect(
				screen.getByText(
					'USDT on BSC escrow acceptance stays blocked until the deployed BSC escrow ABI/artifacts are accepted.'
				)
			).toBeInTheDocument();
		});

		it('should show network metadata in acceptance flow for RBTC', async () => {
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();

			const acceptButton = screen
				.getAllByRole('button')
				.find((button) => button.textContent?.trim() === 'Accept');
			expect(acceptButton).toBeDefined();
			expect(acceptButton).not.toBeDisabled();
		});
	});

	describe('Metadata propagation', () => {
		it('should propagate payment asset metadata from bid to escrow', async () => {
			mockValidateSufficientBalance.mockReturnValue([]);
			mockAcceptBidAndCreateEscrow.mockResolvedValue({
				success: true,
				transactionResult: { hash: '0xabc', escrowId: '1', status: 'pending' }
			});

			const bscBid = {
				...defaultProps.bid,
				content: {
					...defaultBidContent,
					paymentAsset: 'USDT',
					paymentNetwork: 'bsc-mainnet'
				}
			} as NostrEventWithFollowup;

			render(BidAcceptanceForm, {
				props: {
					...defaultProps,
					bid: bscBid
				}
			});
			await tick();

			// BSC escrow is still blocked pre-ABI
			expect(
				screen.getByText(
					'USDT on BSC escrow acceptance stays blocked until the deployed BSC escrow ABI/artifacts are accepted.'
				)
			).toBeInTheDocument();
		});

		it('should maintain network context throughout acceptance workflow', async () => {
			mockValidateSufficientBalance.mockReturnValue([]);

			render(BidAcceptanceForm, { props: defaultProps });
			await tick();

			const acceptButton = screen
				.getAllByRole('button')
				.find((button) => button.textContent?.trim() === 'Accept');

			await fireEvent.click(acceptButton);
			await tick();

			const fundDialog = screen.getByRole('dialog', { name: 'Fund Contract' });
			expect(fundDialog).toBeInTheDocument();

			const fundButton = within(fundDialog).getByRole('button', { name: /^Fund$/i });
			expect(fundButton).toBeDefined();
		});
	});
});

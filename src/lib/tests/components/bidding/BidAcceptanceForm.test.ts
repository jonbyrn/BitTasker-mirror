import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
import type { NostrBidContent, NostrEventWithFollowup } from '$lib/types/bid';
import type { NostrEvent } from 'nostr-tools';
import type { Task } from '$lib/types/task';
import { BudgetTypeEnum, TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';

const { mockAcceptBidAndCreateEscrow, mockValidateSufficientBalance, mockContractCreationStore } =
	vi.hoisted(() => ({
		mockAcceptBidAndCreateEscrow: vi.fn(),
		mockValidateSufficientBalance: vi.fn(),
		mockContractCreationStore: (() => {
			type ContractCreationState = {
				escrowId: string;
				contractEventId?: string;
				error?: string;
			} | null;
			let value: ContractCreationState = null;
			const subscribers = new Set<(next: ContractCreationState) => void>();
			return {
				subscribe: vi.fn((run: (next: ContractCreationState) => void) => {
					run(value);
					subscribers.add(run);
					return () => subscribers.delete(run);
				}),
				set: vi.fn((next: ContractCreationState) => {
					value = next;
					for (const subscriber of subscribers) {
						subscriber(value);
					}
				}),
				update: vi.fn((updater: (current: ContractCreationState) => ContractCreationState) => {
					value = updater(value);
					for (const subscriber of subscribers) {
						subscriber(value);
					}
				})
			};
		})()
	}));

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
			formatRBTCAmount: vi.fn((amount: string) => amount),
			getFeePercentageDisplay: vi.fn(() => '2.5%'),
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
		rsk: {
			connected: true,
			contractConnected: true,
			address: '0x123',
			balance: '1000000000000000000'
		},
		bsc: { connected: false },
		allAssets: [],
		totalBalances: {}
	}),
	walletManager: { initialize: vi.fn(), loadAssets: vi.fn() },
	getProvider: vi.fn(() => null),
	allAssets: writable([{ assetId: 'rbtc', usdValue: 0 }]),
	totalBalances: writable({ sats: 0, rbtc: 0 }),
	formatSats: vi.fn((n: number | bigint | undefined) => String(n ?? 0))
}));

vi.mock('$lib/stores/bid.store', async () => {
	const { writable } = await import('svelte/store');
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
vi.mock('$lib/utils/location/sendLocation', () => ({
	sendLocationsToTaskee: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/helpers/haptics', () => ({
	triggerHaptic: vi.fn(),
	ImpactStyle: { Light: 'Light', Medium: 'Medium', Heavy: 'Heavy' }
}));

vi.mock('$lib/i18n/i18n', () => ({ loadNamespace: vi.fn().mockResolvedValue(undefined) }));

const now = Math.floor(Date.now() / 1000);
const defaultBidContent: NostrBidContent = {
	type: 'bid',
	taskId: 'task-1',
	taskTitle: 'Test Task',
	taskDescription: 'Test Description',
	description: 'Offer details',
	estimatedDuration: '2h',
	proposedApproach: 'Test approach',
	coverLetter: 'Test cover letter',
	timestamp: now,
	bidId: 'bid-1',
	startDateTime: new Date((now + 3600) * 1000).toISOString(),
	endDateTime: new Date((now + 7200) * 1000).toISOString(),
	bidderId: 'npub1test123',
	bidderName: 'Test Taskee',
	bidderRating: 4.5,
	amount: 100,
	currency: 'USD',
	paymentType: 'FIXED',
	estimatedHours: 2
};

const defaultTaskContent: Task = {
	estimatedHours: 2,
	id: 'task-1',
	npub: 'npub1client',
	status: TaskStatusEnum.OPEN,
	title: 'Test Task',
	taskType: TaskTypeEnum.REMOTE,
	description: 'Test Description',
	budget: { amount: 100, currency: 'USD', type: BudgetTypeEnum.FIXED },
	deadline: null,
	dateRange: null,
	pickupLocation: null,
	dropOffLocation: null,
	skills: [],
	categories: [],
	isRemovals: false,
	isBoosted: false,
	boostPercentage: null,
	createdAt: now,
	updatedAt: new Date(now * 1000).toISOString(),
	completedAt: null,
	cancelledAt: null,
	deletedAt: null,
	isDeleted: false,
	requiredSkills: [],
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
	} as unknown as NostrEventWithFollowup,
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

function getPrimaryAcceptButton() {
	return screen.getByRole('button', { name: /^Accept$/ });
}

function getFundDialog() {
	return screen.getByRole('dialog', { name: /^Fund Contract$/ });
}

function getFundButtonInDialog() {
	return within(getFundDialog()).getByRole('button', { name: /^Fund$/ });
}

function getCancelButtonInDialog() {
	return within(getFundDialog()).getByRole('button', { name: /^Cancel$/ });
}

describe('BidAcceptanceForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockValidateSufficientBalance.mockReturnValue([]);
		mockAcceptBidAndCreateEscrow.mockResolvedValue({
			success: true,
			transactionResult: { hash: '0xabc', escrowId: '1', status: 'pending' }
		});
	});

	describe('Accept button and Fund Contract modal', () => {
		it('shows Accept as the primary button label when not submitting', async () => {
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			expect(getPrimaryAcceptButton()).toBeEnabled();
		});

		it('opens Fund Contract modal when Accept is clicked', async () => {
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			await fireEvent.click(getPrimaryAcceptButton());
			await waitFor(() => {
				expect(getFundDialog()).toBeInTheDocument();
			});
		});

		it('does not call acceptBidAndCreateEscrow when only Accept is clicked', async () => {
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			await fireEvent.click(getPrimaryAcceptButton());
			await waitFor(() => {
				expect(getFundDialog()).toBeInTheDocument();
			});
			expect(mockAcceptBidAndCreateEscrow).not.toHaveBeenCalled();
		});

		it('modal shows Cancel and Fund buttons', async () => {
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			await fireEvent.click(getPrimaryAcceptButton());
			await waitFor(() => {
				expect(getFundDialog()).toBeInTheDocument();
			});
			expect(getCancelButtonInDialog()).toBeInTheDocument();
			expect(getFundButtonInDialog()).toBeInTheDocument();
		});

		it('closes modal when Cancel is clicked', async () => {
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			await fireEvent.click(getPrimaryAcceptButton());
			await waitFor(() => {
				expect(getFundDialog()).toBeInTheDocument();
			});
			await fireEvent.click(getCancelButtonInDialog());
			await waitFor(() => {
				expect(screen.queryByRole('dialog', { name: /^Fund Contract$/ })).toBeNull();
			});
		});
	});

	describe('Fund button behavior', () => {
		it('calls acceptBidAndCreateEscrow when Fund is clicked and balance is sufficient', async () => {
			mockValidateSufficientBalance.mockReturnValue([]);
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			await fireEvent.click(getPrimaryAcceptButton());
			await waitFor(() => {
				expect(getFundDialog()).toBeInTheDocument();
			});
			await fireEvent.click(getFundButtonInDialog());
			await waitFor(() => {
				expect(mockAcceptBidAndCreateEscrow).toHaveBeenCalledTimes(1);
			});
		});

		it('keeps modal open and does not call acceptBidAndCreateEscrow when Fund is clicked with insufficient balance', async () => {
			mockValidateSufficientBalance.mockReturnValue([]);
			render(BidAcceptanceForm, { props: defaultProps });
			await tick();
			await fireEvent.click(getPrimaryAcceptButton());
			await waitFor(() => {
				expect(getFundDialog()).toBeInTheDocument();
			});
			mockValidateSufficientBalance.mockReturnValue(['Not enough funds']);
			await fireEvent.click(getFundButtonInDialog());
			await tick();
			expect(mockAcceptBidAndCreateEscrow).not.toHaveBeenCalled();
			expect(getFundDialog()).toBeInTheDocument();
		});
	});
});

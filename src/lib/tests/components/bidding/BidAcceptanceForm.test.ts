import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import BidAcceptanceForm from '$lib/components/bidding/BidAcceptanceForm.svelte';
import type { NostrEventWithFollowup } from '$lib/types/bid';
import type { NostrEvent } from 'nostr-tools';
import type { Task } from '$lib/types/task';

const mockContractCreationStore = writable<{
	escrowId: string;
	contractEventId?: string;
	error?: string;
} | null>(null);

const { mockAcceptBidAndCreateEscrow, mockValidateSufficientBalance } = vi.hoisted(() => ({
	mockAcceptBidAndCreateEscrow: vi.fn(),
	mockValidateSufficientBalance: vi.fn()
}));

vi.mock('$lib/utils/escrow', () => ({
	escrow: {
		bidOps: {
			calculateBidEscrowDetails: vi.fn(() => ({
				totalAmount: '0.001',
				baseAmount: '0.001',
				clientFee: '0.0001',
				estimatedStartTime: Math.floor(Date.now() / 1000) + 3600,
				estimatedCompletionTime: Math.floor(Date.now() / 1000) + 7200,
				clientFeeTier: 1,
				freelancerFeeTier: 1
			})),
			validateEscrowDetails: vi.fn(() => ({ errors: [], warnings: [] })),
			validateSufficientBalance: (...args: unknown[]) => mockValidateSufficientBalance(...args),
			getFeePercentageDisplay: vi.fn((tier: number) => `${tier}%`),
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
		'dashboard.bids.bid_acceptance.base_amount': 'Base Amount',
		'dashboard.bids.bid_acceptance.base_amount_tooltip': 'Base amount tooltip',
		'dashboard.bids.bid_acceptance.client_fee': 'Client Fee {fee}',
		'dashboard.bids.bid_acceptance.fee_tooltip': 'Fee tooltip',
		'dashboard.bids.bid_acceptance.estimated_gas_fee': 'Estimated Gas Fee',
		'dashboard.bids.bid_acceptance.gas_fee_tooltip': 'Gas fee tooltip',
		'dashboard.bids.bid_acceptance.btc_price': 'BTC Price',
		'dashboard.bids.bid_acceptance.sats': 'sats',
		'dashboard.bids.bid_acceptance.additional_notes_label': 'Additional Notes',
		'dashboard.bids.bid_acceptance.additional_notes_placeholder': 'Additional notes',
		'dashboard.bids.bid_acceptance.note': 'Note',
		'dashboard.bids.bid_acceptance.contract_note': 'Contract note',
		'dashboard.bids.bid_acceptance.available_balance': 'Available balance',
		'dashboard.bids.bid_acceptance.required_balance': 'Required balance',
		'dashboard.bids.bid_acceptance.checking_balance': 'Checking balance',
		'dashboard.bids.bid_acceptance.balance_verified': 'Balance verified',
		'dashboard.bids.bid_acceptance.wallet_not_connected': 'Wallet not connected',
		'dashboard.bids.bid_acceptance.wallet_error_prefix': 'Wallet error:',
		'dashboard.bids.bid_acceptance.estimated_start': 'Estimated Start',
		'dashboard.bids.bid_acceptance.estimated_duration': 'Estimated Duration',
		'dashboard.bids.bid_acceptance.insufficient_balance': 'Not enough funds',
		'dashboard.bids.bid_acceptance.cancel': 'Cancel',
		'dashboard.bids.bid_acceptance.anonymous': 'Anonymous',
		'common.cancel': 'Cancel',
		'common.optional': 'Optional',
		'common.components.confirm_modal.confirm': 'Confirm',
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
	allAssets: writable([]),
	totalBalances: writable({}),
	formatSats: vi.fn((n: number) => n.toString())
}));

vi.mock('$lib/stores/bid.store', () => {
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
vi.mock('$app/environment', () => ({ browser: true, dev: false }));

vi.mock('$lib/nostr/task', () => ({ updateTask: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/utils/location/sendLocation', () => ({
	sendLocationsToTaskee: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('$lib/nostr/exact-location', () => ({
	getExactTaskLocations: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/components/user/UserInfoDisplay.svelte', async () => {
	const { default: UserInfoDisplayStub } = await import(
		'../../fixtures/UserInfoDisplayStub.svelte'
	);
	return {
		default: UserInfoDisplayStub
	};
});
vi.mock('$lib/components/messages/MessageModal.svelte', () => ({
	default: vi.fn(() => null)
}));
vi.mock('$lib/components/bidding/SecurePaymentContractModal.svelte', () => ({
	default: vi.fn(() => null)
}));
vi.mock('$lib/components/contracts/ContractFundingWalletCard.svelte', () => ({
	default: () => null
}));
vi.mock('$lib/components/contracts/ContractInitiationDrawer.svelte', async () => {
	const { default: ContractInitiationDrawerStub } = await import(
		'../../fixtures/ContractInitiationDrawerStub.svelte'
	);
	return {
		default: ContractInitiationDrawerStub
	};
});

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

	it('shows Accept as the primary action when not submitting', async () => {
		render(BidAcceptanceForm, { props: defaultProps });
		await tick();

		expect(screen.getByRole('button', { name: /Accept/i })).toBeDefined();
	});

	it('opens the contract initiation drawer when Accept is clicked without submitting immediately', async () => {
		render(BidAcceptanceForm, { props: defaultProps });
		await tick();

		await fireEvent.click(screen.getByRole('button', { name: /Accept/i }));
		await tick();

		expect(screen.getByTestId('bid-contract-initiation-drawer')).toBeDefined();
		expect(screen.getByText('Fund Contract')).toBeDefined();
		expect(mockAcceptBidAndCreateEscrow).not.toHaveBeenCalled();
	});

	it('calls acceptBidAndCreateEscrow when the drawer confirm button is clicked and balance is sufficient', async () => {
		render(BidAcceptanceForm, { props: defaultProps });
		await tick();

		await fireEvent.click(screen.getByRole('button', { name: /Accept/i }));
		await tick();
		await fireEvent.click(screen.getByTestId('bid-contract-initiation-confirm'));

		await waitFor(() => {
			expect(mockAcceptBidAndCreateEscrow).toHaveBeenCalledTimes(1);
		});
	});

	it('keeps the drawer open and does not submit when the drawer confirm button is clicked with insufficient balance', async () => {
		mockValidateSufficientBalance.mockReturnValue(['Not enough funds']);
		render(BidAcceptanceForm, { props: defaultProps });
		await tick();

		await fireEvent.click(screen.getByRole('button', { name: /Accept/i }));
		await tick();
		await fireEvent.click(screen.getByTestId('bid-contract-initiation-confirm'));
		await tick();

		expect(mockAcceptBidAndCreateEscrow).not.toHaveBeenCalled();
		expect(screen.getByTestId('bid-contract-initiation-drawer')).toBeDefined();
	});
});

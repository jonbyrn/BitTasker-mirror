import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import BidAcceptanceFormV2 from '$lib/components/bidding/BidAcceptanceFormV2.svelte';

const {
	fundMock,
	startWorkMock,
	runeConstructorArgs,
	enrichMock,
	sendBidStatusUpdate,
	showSuccessToast,
	showErrorToast
} = vi.hoisted(() => ({
	fundMock: vi.fn(),
	startWorkMock: vi.fn(),
	runeConstructorArgs: { current: null as unknown },
	enrichMock: vi.fn().mockResolvedValue(undefined),
	sendBidStatusUpdate: vi.fn().mockResolvedValue(true),
	showSuccessToast: vi.fn(),
	showErrorToast: vi.fn()
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, opts?: { values?: Record<string, unknown> }) =>
			opts?.values ? `${key} ${JSON.stringify(opts.values)}` : key
		),
		locale: readable('en')
	};
});

vi.mock('$lib/runes/contract.svelte', () => ({
	ContractRune: class {
		status = 'draft';
		snapshot = { fundingInvoice: '', status: 'draft' };
		seals: Array<{ id: string }> = [];
		constructor(input: unknown) {
			runeConstructorArgs.current = input;
		}
		async fund() {
			this.status = 'funded';
			this.snapshot = { fundingInvoice: 'rgb1invoice', status: 'funded' };
			this.seals = [{ id: 'seal-1' }];
			return fundMock();
		}
		async prepareFunding() {
			this.status = 'funding';
			this.snapshot = { fundingInvoice: 'rgb1invoice', status: 'funding' };
			this.seals = [{ id: 'seal-1' }];
			return fundMock();
		}
		async payFundingFromWallet() {
			this.status = 'funded';
			this.snapshot = { fundingInvoice: 'rgb1invoice', status: 'funded' };
			this.seals = [{ id: 'seal-1' }];
			return fundMock();
		}
		async fundForE2E() {
			this.status = 'funded';
			this.snapshot = { fundingInvoice: 'rgb1invoice', status: 'funded' };
			this.seals = [{ id: 'seal-1' }];
			return fundMock();
		}
		async startWork() {
			this.status = 'work_in_progress';
			return startWorkMock();
		}
	}
}));

vi.mock('$lib/api/services/notificationCenter.service', () => ({
	notificationCenterService: { enrich: enrichMock }
}));

vi.mock('$lib/services/rgb/consignment-exchange', () => ({
	sendConsignmentToPeer: vi.fn()
}));

vi.mock('$lib/utils/nostr-bid', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/utils/nostr-bid')>();
	return {
		...actual,
		sendBidStatusUpdate
	};
});

vi.mock('$lib/stores/app.store', () => ({
	appStore: { showSuccessToast, showErrorToast }
}));

vi.mock('$lib/runes/btcPrice.svelte', () => ({
	btcPrice: { price: 100_000 }
}));

vi.mock('$lib/wasm/init-wasm', () => ({
	initWasm: vi.fn().mockResolvedValue(true),
	exposeInitWasm: vi.fn()
}));

vi.mock('$lib/stores/wallet/wallet-manager', () => ({
	walletManager: {
		initialize: vi.fn().mockResolvedValue(undefined),
		releaseRgbLock: vi.fn().mockResolvedValue(undefined)
	}
}));

vi.mock('$lib/components/contracts/PaymentSplitSlider.svelte', () => ({
	default: () => null
}));

const walletState = vi.hoisted(() => ({
	value: {
		isConnected: true,
		rgb: { initialized: true, balanceSats: 500_000 },
		wdk: { btcOnchain: { address: '' } }
	}
}));

vi.mock('$lib/stores/wallet/wallet-state', async () => {
	const inner = writable(walletState.value);
	walletState.set = (next: typeof walletState.value) => inner.set(next);
	return {
		walletStore: { subscribe: inner.subscribe },
		state: { utexoWallet: null }
	};
});

function makeBid(overrides: Record<string, unknown> = {}) {
	return {
		id: 'bid-1',
		pubkey: 'creator-pubkey',
		bidContent: {
			type: 'bid',
			taskId: 'task-1',
			taskTitle: 'Install a node',
			description: 'Fallback bid comment',
			proposedApproach: 'I will configure the RGB wallet and document the setup.',
			amount: 200,
			currency: 'USD',
			bidderId: 'bidder-pubkey',
			...overrides
		}
	} as never;
}

function makeTask() {
	return {
		id: 'task-1',
		pubkey: 'creator-pubkey',
		taskContent: { title: 'Test Task', status: 'OPEN' }
	} as never;
}

describe('BidAcceptanceFormV2', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete window.__PLAYWRIGHT_TEST__;
		vi.stubEnv('VITE_E2E_TURNSTILE_BYPASS', '');
		walletState.set({
			isConnected: true,
			rgb: { initialized: true, balanceSats: 500_000 },
			wdk: { btcOnchain: { address: '' } }
		});
		fundMock.mockResolvedValue({ status: 'funded' });
		startWorkMock.mockResolvedValue({ status: 'work_in_progress' });
	});

	it('renders the bid summary with platform fee and total', () => {
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		expect(getByTestId('bid-base-amount').textContent).toBe('200,000 sats');
		expect(getByTestId('bid-platform-fee').textContent).toBe('5,000 sats');
		expect(getByTestId('bid-total-payment').textContent).toBe('205,000 sats');
		expect(getByTestId('bid-total-sats').textContent).toContain('205,000');
		expect(getByTestId('contract-settlement-unit').textContent).toContain('Bitcoin');
	});

	it('uses sat totals from SATS bids without converting through USD', () => {
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid({ amount: 3000, currency: 'SATS' }), task: makeTask() }
		});
		expect(getByTestId('bid-base-amount').textContent).toBe('3,000 sats');
		expect(getByTestId('bid-platform-fee').textContent).toBe('75 sats');
		expect(getByTestId('bid-total-payment').textContent).toBe('3,075 sats');
		expect(getByTestId('bid-total-sats').textContent).toContain('3,075');
	});

	it('shows disconnected warning and disables confirm when wallet is not ready', () => {
		walletState.set({
			isConnected: false,
			rgb: { initialized: false, balanceSats: 0 },
			wdk: { btcOnchain: { address: '' } }
		});
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		expect(getByTestId('wallet-disconnected')).toBeTruthy();
		expect((getByTestId('accept-fund-button') as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows a green connected status when the RGB wallet is online', () => {
		walletState.set({
			isConnected: true,
			rgb: { initialized: true, balanceSats: 500_000 },
			wdk: { btcOnchain: { address: '' } }
		});
		const { getByTestId, queryByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		expect(getByTestId('wallet-connected')).toBeTruthy();
		expect(queryByTestId('wallet-disconnected')).toBeNull();
		expect((getByTestId('accept-fund-button') as HTMLButtonElement).disabled).toBe(false);
	});

	it('shows insufficient-funds error when balance is below required sats', () => {
		walletState.set({
			isConnected: true,
			rgb: { initialized: true, balanceSats: 1_000 },
			wdk: { btcOnchain: { address: '' } }
		});
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		expect(getByTestId('insufficient-funds')).toBeTruthy();
		expect((getByTestId('accept-fund-button') as HTMLButtonElement).disabled).toBe(true);
	});

	it('funds RGB escrow with Bitcoin settlement, then starts the task with messages and notifications', async () => {
		const onFunded = vi.fn();
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask(), onFunded }
		});

		await fireEvent.click(getByTestId('accept-fund-button'));

		await waitFor(() => expect(fundMock).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(getByTestId('pay-funding-from-wallet')).toBeTruthy());
		expect(getByTestId('check-funding-button')).toBeTruthy();
		expect(runeConstructorArgs.current).toMatchObject({
			contractId: 'contract-task-1-bid-1',
			contractTitle: 'Install a node',
			bidderComments: 'I will configure the RGB wallet and document the setup.',
			totalAmountUsd: 205,
			amountSats: 205_000,
			split: {
				primaryAsset: 'btc_onchain',
				primaryPercentage: 100,
				secondaryAsset: 'btc_lightning',
				secondaryPercentage: 0
			},
			partyPubkeys: ['bidder-pubkey', 'creator-pubkey']
		});

		await waitFor(() => expect(sendBidStatusUpdate).toHaveBeenCalledTimes(1));
		expect(sendBidStatusUpdate).toHaveBeenCalledWith(
			'bid-1',
			'task-1',
			'bidder-pubkey',
			'ACCEPTED',
			'Bid accepted',
			'contract-task-1-bid-1'
		);
		expect(enrichMock).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'bid_accepted', escrowId: 'contract-task-1-bid-1' })
		);

		await fireEvent.click(getByTestId('pay-funding-from-wallet'));
		await waitFor(() => expect(fundMock).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(sendBidStatusUpdate).toHaveBeenCalledTimes(2));
		expect(sendBidStatusUpdate).toHaveBeenCalledWith(
			'bid-1',
			'task-1',
			'bidder-pubkey',
			'ESCROW_FUNDED',
			'RGB escrow funded',
			'contract-task-1-bid-1'
		);
		expect(enrichMock).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'contract_created', escrowId: 'contract-task-1-bid-1' })
		);
		await waitFor(() => expect(getByTestId('start-contract-button')).toBeTruthy());
		expect(getByTestId('start-contract-button').textContent).toContain('Start Task');
		expect(getByTestId('start-contract-button')).toBeTruthy();
		expect(onFunded).not.toHaveBeenCalled();

		await fireEvent.click(getByTestId('start-contract-button'));

		await waitFor(() => expect(startWorkMock).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(sendBidStatusUpdate).toHaveBeenCalledTimes(3));
		expect(sendBidStatusUpdate).toHaveBeenCalledWith(
			'bid-1',
			'task-1',
			'bidder-pubkey',
			'WORK_IN_PROGRESS',
			'Task started',
			'contract-task-1-bid-1'
		);
		expect(enrichMock).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'work_started',
				escrowId: 'contract-task-1-bid-1',
				estimatedCompletionTime: expect.any(Number)
			})
		);

		expect(showSuccessToast).toHaveBeenCalled();
		expect(onFunded).toHaveBeenCalledWith('contract-task-1-bid-1');
	});

	it('surfaces funding failure and does not send consignment', async () => {
		fundMock.mockRejectedValue(new Error('RGB commitment failed'));
		const onFunded = vi.fn();
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask(), onFunded }
		});

		await fireEvent.click(getByTestId('accept-fund-button'));

		await waitFor(() => expect(showErrorToast).toHaveBeenCalled());
		expect(sendBidStatusUpdate).not.toHaveBeenCalled();
		expect(onFunded).not.toHaveBeenCalled();
		expect(getByTestId('funding-error').textContent).toContain('RGB commitment failed');
	});

	it('calls onCancel without side effects', async () => {
		const onCancel = vi.fn();
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask(), onCancel }
		});
		await fireEvent.click(getByTestId('cancel-button'));
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(fundMock).not.toHaveBeenCalled();
	});
});

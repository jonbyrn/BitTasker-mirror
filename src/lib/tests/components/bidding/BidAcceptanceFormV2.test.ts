import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import BidAcceptanceFormV2 from '$lib/components/bidding/BidAcceptanceFormV2.svelte';

const {
	fundMock,
	runeConstructorArgs,
	sendConsignmentToPeer,
	sendBidStatusUpdate,
	showSuccessToast,
	showErrorToast
} = vi.hoisted(() => ({
	fundMock: vi.fn(),
	runeConstructorArgs: { current: null as unknown },
	sendConsignmentToPeer: vi.fn().mockResolvedValue({ id: 'evt-1' }),
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
		seals: Array<{ id: string }> = [];
		constructor(input: unknown) {
			runeConstructorArgs.current = input;
		}
		async fund() {
			this.status = 'funded';
			this.seals = [{ id: 'seal-1' }];
			return fundMock();
		}
	}
}));

vi.mock('$lib/services/rgb/consignment-exchange', () => ({
	sendConsignmentToPeer
}));

vi.mock('$lib/utils/nostr-bid', () => ({
	sendBidStatusUpdate
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: { showSuccessToast, showErrorToast }
}));

vi.mock('$lib/runes/btcPrice.svelte', () => ({
	btcPrice: { price: 100_000 }
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
		walletState.set({
			isConnected: true,
			rgb: { initialized: true, balanceSats: 500_000 },
			wdk: { btcOnchain: { address: '' } }
		});
		fundMock.mockResolvedValue({ status: 'funded' });
	});

	it('renders the bid summary with platform fee and total', () => {
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		expect(getByTestId('bid-base-amount').textContent).toBe('$200.00');
		expect(getByTestId('bid-platform-fee').textContent).toBe('$5.00');
		expect(getByTestId('bid-total-payment').textContent).toBe('$205.00');
		expect(getByTestId('bid-total-sats').textContent).toContain('205,000');
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
		expect(
			(getByTestId('accept-fund-button') as HTMLButtonElement).disabled
		).toBe(true);
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
		expect(
			(getByTestId('accept-fund-button') as HTMLButtonElement).disabled
		).toBe(true);
	});

	it('funds escrow via ContractRune, then delivers consignment and status over Nostr DM', async () => {
		const onFunded = vi.fn();
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask(), onFunded }
		});

		await fireEvent.click(getByTestId('accept-fund-button'));

		await waitFor(() => expect(fundMock).toHaveBeenCalledTimes(1));
		expect(runeConstructorArgs.current).toMatchObject({
			contractId: 'contract-task-1-bid-1',
			totalAmountUsd: 205,
			partyPubkeys: ['bidder-pubkey', 'creator-pubkey']
		});

		await waitFor(() => expect(sendConsignmentToPeer).toHaveBeenCalledTimes(1));
		expect(sendConsignmentToPeer).toHaveBeenCalledWith(
			'bidder-pubkey',
			expect.objectContaining({
				contractId: 'contract-task-1-bid-1',
				assetId: 'btc_onchain',
				transferId: 'seal-1'
			})
		);

		await waitFor(() => expect(sendBidStatusUpdate).toHaveBeenCalledTimes(1));
		expect(sendBidStatusUpdate).toHaveBeenCalledWith(
			'bid-1',
			'task-1',
			'bidder-pubkey',
			'ACCEPTED',
			undefined,
			'contract-task-1-bid-1'
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
		expect(sendConsignmentToPeer).not.toHaveBeenCalled();
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

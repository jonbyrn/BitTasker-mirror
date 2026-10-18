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
	showErrorToast,
	lightningState
} = vi.hoisted(() => {
	function writable<T>(initial: T) {
		let value = initial;
		const subscribers = new Set<(next: T) => void>();
		return {
			set(next: T) {
				value = next;
				for (const run of subscribers) run(value);
			},
			subscribe(run: (next: T) => void) {
				subscribers.add(run);
				run(value);
				return () => {
					subscribers.delete(run);
				};
			}
		};
	}
	return {
		fundMock: vi.fn(),
		startWorkMock: vi.fn(),
		runeConstructorArgs: { current: null as unknown },
		enrichMock: vi.fn().mockResolvedValue(undefined),
		sendBidStatusUpdate: vi.fn().mockResolvedValue(true),
		showSuccessToast: vi.fn(),
		showErrorToast: vi.fn(),
		lightningState: writable({
			ready: true,
			peerHost: 'lsp-signet.utexo.com',
			channel: 'open' as const,
			lnInvoice: '',
			rgbInvoice: ''
		})
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, opts?: { values?: Record<string, unknown> }) =>
			opts?.values ? `${key} ${JSON.stringify(opts.values)}` : key
		),
		locale: readable('en')
	};
});

vi.mock('$lib/stores/wallet/signet-lsp', () => ({
	lightningStore: lightningState
}));

vi.mock('$lib/nostr/task', () => ({
	assignTask: vi.fn().mockResolvedValue(true)
}));

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
		async confirmFunding() {
			this.status = 'funded';
			this.snapshot = { fundingInvoice: 'rgb1invoice', status: 'funded' };
			return this.snapshot;
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
	},
	utexoWallet: null as null | {
		listPeers: () => Promise<unknown[]>;
		listChannels: () => Promise<unknown[]>;
	}
}));

vi.mock('$lib/stores/wallet/wallet-state', async () => {
	const inner = writable(walletState.value);
	walletState.set = (next: typeof walletState.value) => inner.set(next);
	return {
		walletStore: { subscribe: inner.subscribe },
		state: walletState
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
		lightningState.set({
			ready: true,
			peerHost: 'lsp-signet.utexo.com',
			channel: 'open',
			lnInvoice: '',
			rgbInvoice: ''
		});
		walletState.utexoWallet = null;
	});

	it('locks a USD bid as dollars and offers USDT funding', () => {
		const { getByTestId, queryByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		expect(getByTestId('bid-base-amount').textContent).toBe('200.00 USDT');
		expect(queryByTestId('bid-platform-fee')).toBeNull();
		expect(getByTestId('contract-settlement-unit').textContent).toContain('USDT');
		expect(getByTestId('fund-rail-usdt')).toBeTruthy();
		expect((getByTestId('fund-rail-usdt') as HTMLInputElement).checked).toBe(true);
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

	it('shows insufficient-funds error when a sat bid exceeds the wallet', () => {
		walletState.set({
			isConnected: true,
			rgb: { initialized: true, balanceSats: 1_000 },
			wdk: { btcOnchain: { address: '' } }
		});
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid({ amount: 3000, currency: 'SATS' }), task: makeTask() }
		});
		expect(getByTestId('insufficient-funds')).toBeTruthy();
		expect((getByTestId('accept-fund-button') as HTMLButtonElement).disabled).toBe(true);
	});

	it('keeps USDT fund enabled when the LSP channel is closed', () => {
		lightningState.set({
			ready: false,
			peerHost: 'lsp-signet.utexo.com',
			channel: 'missing',
			lnInvoice: '',
			rgbInvoice: ''
		});
		const { getByTestId, queryByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		expect(queryByTestId('lsp-channel-closed')).toBeNull();
		expect((getByTestId('accept-fund-button') as HTMLButtonElement).disabled).toBe(false);
	});

	it('accepts a USD bid when the sat balance is below the dollar quote', () => {
		walletState.set({
			isConnected: true,
			rgb: { initialized: true, balanceSats: 1_000 },
			wdk: { btcOnchain: { address: '' } }
		});
		const { getByTestId, queryByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		expect(queryByTestId('insufficient-funds')).toBeNull();
		expect((getByTestId('accept-fund-button') as HTMLButtonElement).disabled).toBe(false);
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
			totalAmountUsd: 200,
			lockedAmount: 200,
			lockedCurrency: 'USD',
			split: {
				primaryAsset: 'usdt_rgb',
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
		expect(getByTestId('start-contract-button').textContent).toContain(
			'dashboard.bids.bid_acceptance.start_task'
		);
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

	it('keeps lightning fund off when the node has no peer and does not show pending', async () => {
		const { getByTestId, queryByText } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		await fireEvent.click(getByTestId('fund-rail-lightning'));
		expect(queryByText('dashboard.bids.bid_acceptance.lightning_pending')).toBeNull();
		expect(getByTestId('lightning-no-peer').textContent).toContain('wallet.lightning_no_peer');
		expect((getByTestId('accept-fund-button') as HTMLButtonElement).disabled).toBe(true);
		expect(showSuccessToast).not.toHaveBeenCalled();
	});

	it('locks a lightning dollar bid in sats and disables pay when the invoice is rgb', async () => {
		walletState.utexoWallet = {
			listPeers: () => Promise.resolve([{ pubkey: '02aa' }]),
			listChannels: () => Promise.resolve([{ isUsable: true }])
		};
		const { getByTestId } = render(BidAcceptanceFormV2, {
			props: { bid: makeBid(), task: makeTask() }
		});
		await fireEvent.click(getByTestId('fund-rail-lightning'));
		await waitFor(() =>
			expect((getByTestId('accept-fund-button') as HTMLButtonElement).disabled).toBe(false)
		);
		await fireEvent.click(getByTestId('accept-fund-button'));
		await waitFor(() => expect(fundMock).toHaveBeenCalledTimes(1));
		expect(runeConstructorArgs.current).toMatchObject({
			lockedCurrency: 'SATS',
			lockedAmount: 205_000,
			amountSats: 205_000,
			split: {
				primaryAsset: 'btc_lightning',
				primaryPercentage: 100,
				secondaryAsset: 'usdt_rgb',
				secondaryPercentage: 0
			}
		});
		await waitFor(() =>
			expect((getByTestId('pay-funding-from-wallet') as HTMLButtonElement).disabled).toBe(true)
		);
		expect(showSuccessToast).not.toHaveBeenCalled();
	});
});

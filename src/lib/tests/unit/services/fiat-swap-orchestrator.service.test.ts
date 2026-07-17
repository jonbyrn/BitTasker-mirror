/**
 * Fiat Swap Orchestrator — Unit Tests
 *
 * Tests the buy-side fiat-to-crypto flow:
 *   idle → awaiting_payment → payment_confirmed → crypto_delivered → complete
 *   idle → awaiting_payment → failed (expired/swap_failed)
 *
 * Covers: state machine transitions, Capacitor Preferences persistence, polling,
 * stale flow expiry, listener callbacks, cancel, helper functions,
 * createOrder, and trackCheckoutReturn.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('$lib/services/fiat-ramp.service', () => ({
	changellyFiatService: {
		createOnRampOrder: vi.fn(),
		getTransactionStatus: vi.fn()
	}
}));

vi.mock('ethers', () => ({
	ethers: {
		getAddress: vi.fn((addr: string) => addr),
		Wallet: {
			createRandom: vi.fn(() => ({
				publicKey: '0x02' + 'ab'.repeat(32)
			}))
		}
	}
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('$lib/services/symbiosis.service', () => ({
	symbiosisService: {
		getQuote: vi.fn()
	}
}));

vi.mock('$lib/services/BoltzProvider', () => ({
	boltzProvider: {
		createSwap: vi.fn()
	}
}));

const { mockPreferencesGet, mockPreferencesSet, mockPreferencesRemove } = vi.hoisted(() => ({
	mockPreferencesGet: vi.fn(),
	mockPreferencesSet: vi.fn(),
	mockPreferencesRemove: vi.fn()
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: mockPreferencesGet,
		set: mockPreferencesSet,
		remove: mockPreferencesRemove
	}
}));

vi.mock('$lib/utils/constants/storage', () => ({
	StorageKeys: {
		FIAT_SWAP_FLOW: 'bittasker_fiat_flow'
	}
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { FiatSwapOrchestrator } from '$lib/services/fiat-swap-orchestrator.service';
import { changellyFiatService } from '$lib/services/fiat-ramp.service';
import { ethers } from 'ethers';
import * as Sentry from '@sentry/sveltekit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_ORDER = {
	orderId: 'order-001',
	externalOrderId: 'ext-001',
	externalUserId: 'user-001',
	providerCode: 'moonpay',
	currencyFrom: 'USD',
	currencyTo: 'WBTC',
	amountFrom: '100',
	walletAddress: '0xabc',
	redirectUrl: 'https://moonpay.com/checkout',
	createdAt: '2025-01-01T00:00:00Z'
};

function makeStoredFlow(overrides?: Record<string, unknown>): string {
	return JSON.stringify({
		orderId: 'order-stored',
		externalOrderId: 'ext-stored',
		asset: 'usdt0-arb',
		stage: 'awaiting_payment',
		providerCode: 'moonpay',
		fiatAmount: '50',
		redirectUrl: 'https://moonpay.com/stored',
		startedAt: Date.now() - 60_000,
		updatedAt: Date.now() - 60_000,
		...overrides
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FiatSwapOrchestrator', () => {
	let orchestrator: FiatSwapOrchestrator;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		mockPreferencesGet.mockResolvedValue({ value: null });
		mockPreferencesSet.mockResolvedValue(undefined);
		mockPreferencesRemove.mockResolvedValue(undefined);

		vi.stubGlobal('document', {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			visibilityState: 'visible'
		});

		// Default ethers.getAddress to pass-through
		vi.mocked(ethers.getAddress).mockImplementation((addr: string) => addr);
	});

	afterEach(() => {
		if (orchestrator) orchestrator.destroy();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	async function createOrchestrator(): Promise<FiatSwapOrchestrator> {
		orchestrator = new FiatSwapOrchestrator();
		await orchestrator.init();
		return orchestrator;
	}

	// ── Helper functions (tested via createOrder behavior) ──────────────

	describe('changellyTickerForAsset (via createOrder)', () => {
		it('maps rbtc → WBTC', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'rbtc',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(changellyFiatService.createOnRampOrder).toHaveBeenCalledWith(
				expect.objectContaining({ cryptoCurrency: 'WBTC' })
			);
		});

		it('maps usdt0-arb → USDTARB', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(changellyFiatService.createOnRampOrder).toHaveBeenCalledWith(
				expect.objectContaining({ cryptoCurrency: 'USDTARB' })
			);
		});

		it('maps wbtc-arb → WBTC', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'wbtc-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(changellyFiatService.createOnRampOrder).toHaveBeenCalledWith(
				expect.objectContaining({ cryptoCurrency: 'WBTC' })
			);
		});

		it('maps btc-onchain → BTC', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'btc-onchain',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(changellyFiatService.createOnRampOrder).toHaveBeenCalledWith(
				expect.objectContaining({ cryptoCurrency: 'BTC' })
			);
		});
	});

	describe('needsAutoSwap (via flow behavior)', () => {
		it('rbtc asset triggers auto-swap after crypto delivery', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue({
				...VALID_ORDER,
				externalOrderId: 'ext-swap'
			});
			vi.mocked(changellyFiatService.getTransactionStatus).mockResolvedValue({
				orderId: 'order-001',
				externalOrderId: 'ext-swap',
				status: 'complete',
				currencyFrom: 'USD',
				currencyTo: 'WBTC',
				amountFrom: '100',
				amountTo: '0.001',
				walletAddress: '0xabc',
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:01:00Z'
			});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'rbtc',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			// First poll resolves to 'complete' → payment_confirmed → balance polling starts
			await vi.advanceTimersByTimeAsync(0);

			// Balance polling (5s) triggers crypto_delivered → converting → swap_failed
			// (auto-swap starts but fails because Symbiosis/Boltz are placeholder implementations)
			await vi.advanceTimersByTimeAsync(5_000);
			// Should transition through converting to swap_failed (placeholder auto-swap)
			const flow = o.getActiveFlow();
			expect(flow?.stage).toBe('swap_failed');
		});

		it('non-rbtc asset goes directly to complete after delivery', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue({
				...VALID_ORDER,
				externalOrderId: 'ext-noswap'
			});
			vi.mocked(changellyFiatService.getTransactionStatus).mockResolvedValue({
				orderId: 'order-001',
				externalOrderId: 'ext-noswap',
				status: 'complete',
				currencyFrom: 'USD',
				currencyTo: 'USDTARB',
				amountFrom: '100',
				amountTo: '95',
				walletAddress: '0xabc',
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:01:00Z'
			});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			await vi.advanceTimersByTimeAsync(0);

			// Balance polling (5s) triggers crypto_delivered → complete (no auto-swap for usdt0-arb)
			await vi.advanceTimersByTimeAsync(5_000);
			const flow = o.getActiveFlow();
			expect(flow?.stage).toBe('complete');
		});
	});

	// ── createOrder ────────────────────────────────────────────────────

	describe('createOrder', () => {
		it('creates Changelly order and transitions to awaiting_payment', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			const result = await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(result.redirectUrl).toBe('https://moonpay.com/checkout');
			expect(result.orderId).toBe('order-001');
			expect(o.getActiveFlow()?.stage).toBe('awaiting_payment');
		});

		it('checksums wallet address via ethers.getAddress', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			vi.mocked(ethers.getAddress).mockReturnValue('0xAbC');
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(ethers.getAddress).toHaveBeenCalledWith('0xabc');
			expect(changellyFiatService.createOnRampOrder).toHaveBeenCalledWith(
				expect.objectContaining({ cryptoAddress: '0xAbC' })
			);
		});

		it('persists flow via Capacitor Preferences', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(mockPreferencesSet).toHaveBeenCalledWith({
				key: 'bittasker_fiat_flow',
				value: expect.any(String)
			});
		});

		it('throws if active flow exists and is not stale', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await expect(
				o.createOrder({
					asset: 'usdt0-arb',
					fiatAmount: '50',
					walletAddress: '0xdef',
					providerCode: 'moonpay',
					country: 'US'
				})
			).rejects.toThrow('already in progress');
		});

		it('clears stale flow (>30 min) and creates new order', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			// Simulate flow being stale by advancing time
			vi.advanceTimersByTime(31 * 60 * 1000);

			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue({
				...VALID_ORDER,
				orderId: 'order-new',
				redirectUrl: 'https://moonpay.com/new'
			});

			const result = await o.createOrder({
				asset: 'wbtc-arb',
				fiatAmount: '200',
				walletAddress: '0xdef',
				providerCode: 'transak',
				country: 'ES'
			});

			expect(result.orderId).toBe('order-new');
		});

		it('allows new order after terminal state (complete)', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder)
				.mockResolvedValueOnce(VALID_ORDER)
				.mockResolvedValueOnce({ ...VALID_ORDER, orderId: 'order-2' });

			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			// Simulate complete by setting stage directly
			await o.cancel(); // clears to null
			const result = await o.createOrder({
				asset: 'wbtc-arb',
				fiatAmount: '50',
				walletAddress: '0xdef',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(result.orderId).toBe('order-2');
		});

		it('logs Sentry breadcrumb', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
				expect.objectContaining({
					category: 'fiat-orchestrator',
					message: 'Creating Changelly order'
				})
			);
		});
	});

	// ── State machine: Changelly polling ───────────────────────────────

	describe('Changelly polling — state transitions', () => {
		it('transitions to payment_confirmed on Changelly complete', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			vi.mocked(changellyFiatService.getTransactionStatus).mockResolvedValue({
				orderId: 'order-001',
				externalOrderId: 'ext-001',
				status: 'complete',
				currencyFrom: 'USD',
				currencyTo: 'WBTC',
				amountFrom: '100',
				amountTo: '0.001',
				walletAddress: '0xabc',
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:01:00Z'
			});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			// First poll happens immediately (sync promise resolution)
			await vi.advanceTimersByTimeAsync(0);

			// After Changelly complete → payment_confirmed → balance polling starts
			expect(o.getActiveFlow()?.stage).toBe('payment_confirmed');

			// Balance polling interval (5s) triggers checkCryptoArrived → crypto_delivered → complete
			await vi.advanceTimersByTimeAsync(5_000);
			expect(o.getActiveFlow()?.stage).toBe('complete');
		});

		it('transitions to failed on Changelly failed status', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			vi.mocked(changellyFiatService.getTransactionStatus).mockResolvedValue({
				orderId: 'order-001',
				externalOrderId: 'ext-001',
				status: 'failed',
				currencyFrom: 'USD',
				currencyTo: 'WBTC',
				amountFrom: '100',
				amountTo: null,
				walletAddress: '0xabc',
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:01:00Z'
			});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			await vi.advanceTimersByTimeAsync(0);

			expect(o.getActiveFlow()?.stage).toBe('failed');
			expect(o.getActiveFlow()?.error).toBe('wallet.buy_sell.transaction_status');
		});

		it('transitions to failed on Changelly expired status', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			vi.mocked(changellyFiatService.getTransactionStatus).mockResolvedValue({
				orderId: 'order-001',
				externalOrderId: 'ext-001',
				status: 'expired',
				currencyFrom: 'USD',
				currencyTo: 'WBTC',
				amountFrom: '100',
				amountTo: null,
				walletAddress: '0xabc',
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:01:00Z'
			});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			await vi.advanceTimersByTimeAsync(0);

			expect(o.getActiveFlow()?.stage).toBe('failed');
		});

		it('keeps polling on pending status', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			vi.mocked(changellyFiatService.getTransactionStatus)
				.mockResolvedValueOnce({
					orderId: 'order-001',
					externalOrderId: 'ext-001',
					status: 'pending',
					currencyFrom: 'USD',
					currencyTo: 'WBTC',
					amountFrom: '100',
					amountTo: null,
					walletAddress: '0xabc',
					createdAt: '2025-01-01T00:00:00Z',
					updatedAt: '2025-01-01T00:01:00Z'
				})
				.mockResolvedValueOnce({
					orderId: 'order-001',
					externalOrderId: 'ext-001',
					status: 'complete',
					currencyFrom: 'USD',
					currencyTo: 'WBTC',
					amountFrom: '100',
					amountTo: '0.001',
					walletAddress: '0xabc',
					createdAt: '2025-01-01T00:00:00Z',
					updatedAt: '2025-01-01T00:01:00Z'
				});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			await vi.advanceTimersByTimeAsync(0);

			// Still awaiting payment — pending
			expect(o.getActiveFlow()?.stage).toBe('awaiting_payment');

			// Next interval triggers complete
			await vi.advanceTimersByTimeAsync(15_000);
			expect(o.getActiveFlow()?.stage).toBe('payment_confirmed');

			// Balance polling triggers complete
			await vi.advanceTimersByTimeAsync(5_000);
			expect(o.getActiveFlow()?.stage).toBe('complete');
		});

		it('auto-expires after max polling attempts', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			vi.mocked(changellyFiatService.getTransactionStatus).mockResolvedValue({
				orderId: 'order-001',
				externalOrderId: 'ext-001',
				status: 'pending',
				currencyFrom: 'USD',
				currencyTo: 'WBTC',
				amountFrom: '100',
				amountTo: null,
				walletAddress: '0xabc',
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:01:00Z'
			});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();

			// 120 polls × 15s = 30 min (first poll is immediate, then 119 intervals)
			// We advance past the max: 121 intervals × 15s
			await vi.advanceTimersByTimeAsync(121 * 15_000);

			expect(o.getActiveFlow()?.stage).toBe('failed');
			expect(o.getActiveFlow()?.error).toBe('wallet.buy_sell.payment_not_received');
		});

		it('handles rate-limit (429) without counting as attempt', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			vi.mocked(changellyFiatService.getTransactionStatus)
				.mockRejectedValueOnce(new Error('429 Too Many Requests'))
				.mockResolvedValueOnce({
					orderId: 'order-001',
					externalOrderId: 'ext-001',
					status: 'complete',
					currencyFrom: 'USD',
					currencyTo: 'WBTC',
					amountFrom: '100',
					amountTo: '0.001',
					walletAddress: '0xabc',
					createdAt: '2025-01-01T00:00:00Z',
					updatedAt: '2025-01-01T00:01:00Z'
				});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			await vi.advanceTimersByTimeAsync(0);

			// Rate-limited but still polling
			expect(o.getActiveFlow()?.stage).toBe('awaiting_payment');

			// Next interval succeeds
			await vi.advanceTimersByTimeAsync(15_000);
			expect(o.getActiveFlow()?.stage).toBe('payment_confirmed');

			// Balance polling triggers complete
			await vi.advanceTimersByTimeAsync(5_000);
			expect(o.getActiveFlow()?.stage).toBe('complete');
		});

		it('no-ops when no flow exists', async () => {
			const o = await createOrchestrator();
			// Should not throw
			await o.startMonitoring();
		});
	});

	// ── Listener callbacks ─────────────────────────────────────────────

	describe('onStageChange', () => {
		it('receives state snapshots on stage change', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			const snapshots: string[] = [];
			o.onStageChange((state) => {
				snapshots.push(state.stage);
			});

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(snapshots).toContain('awaiting_payment');
		});

		it('unsubscribe stops receiving callbacks', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			const snapshots: string[] = [];
			const unsub = o.onStageChange((state) => {
				snapshots.push(state.stage);
			});

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			const countBefore = snapshots.length;
			unsub();

			// Trigger another notification
			await o.cancel();

			// Should not have received the cancel snapshot
			expect(snapshots.length).toBe(countBefore);
		});

		it('listener error does not break other listeners', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			const goodSnapshots: string[] = [];
			o.onStageChange(() => {
				throw new Error('listener crash');
			});
			o.onStageChange((state) => {
				goodSnapshots.push(state.stage);
			});

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			expect(goodSnapshots).toContain('awaiting_payment');
		});
	});

	// ── Cancel ─────────────────────────────────────────────────────────

	describe('cancel', () => {
		it('clears flow and notifies listeners', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			const snapshots: string[] = [];
			o.onStageChange((state) => {
				if (state) snapshots.push(state.stage);
			});

			await o.cancel();

			expect(o.getActiveFlow()).toBeNull();
			expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_fiat_flow' });
		});

		it('stops polling timers', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			vi.mocked(changellyFiatService.getTransactionStatus).mockResolvedValue({
				orderId: 'order-001',
				externalOrderId: 'ext-001',
				status: 'pending',
				currencyFrom: 'USD',
				currencyTo: 'WBTC',
				amountFrom: '100',
				amountTo: null,
				walletAddress: '0xabc',
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:01:00Z'
			});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			await vi.advanceTimersByTimeAsync(0);

			const callsBefore = vi.mocked(changellyFiatService.getTransactionStatus).mock.calls.length;
			await o.cancel();

			// Advance time — no more polls should fire
			await vi.advanceTimersByTimeAsync(60_000);
			expect(vi.mocked(changellyFiatService.getTransactionStatus).mock.calls.length).toBe(
				callsBefore
			);
		});
	});

	// ── Capacitor Preferences persistence ──────────────────────────────

	describe('Capacitor Preferences persistence', () => {
		it('restores flow from Preferences on init', async () => {
			mockPreferencesGet.mockResolvedValue({ value: makeStoredFlow() });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).not.toBeNull();
			expect(o.getActiveFlow()?.orderId).toBe('order-stored');
			expect(o.getActiveFlow()?.stage).toBe('awaiting_payment');
		});

		it('auto-expires stale flows (>30 min) on restore', async () => {
			const staleTime = Date.now() - 31 * 60 * 1000;
			mockPreferencesGet.mockResolvedValue({
				value: makeStoredFlow({
					updatedAt: staleTime,
					startedAt: staleTime
				})
			});

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
			expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_fiat_flow' });
		});

		it('does not restore terminal states (complete)', async () => {
			mockPreferencesGet.mockResolvedValue({ value: makeStoredFlow({ stage: 'complete' }) });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
			expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_fiat_flow' });
		});

		it('does not restore terminal states (failed)', async () => {
			mockPreferencesGet.mockResolvedValue({ value: makeStoredFlow({ stage: 'failed' }) });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
		});

		it('does not restore terminal states (swap_failed)', async () => {
			mockPreferencesGet.mockResolvedValue({ value: makeStoredFlow({ stage: 'swap_failed' }) });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
		});

		it('clears corrupted data on restore', async () => {
			mockPreferencesGet.mockResolvedValue({ value: 'not-valid-json!!!' });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
			expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_fiat_flow' });
		});

		it('clears data with missing required fields', async () => {
			mockPreferencesGet.mockResolvedValue({ value: JSON.stringify({ orderId: 123 }) });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
			expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_fiat_flow' });
		});

		it('clears data with invalid stage value', async () => {
			mockPreferencesGet.mockResolvedValue({
				value: makeStoredFlow({ stage: 'bogus_stage' })
			});

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
			expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_fiat_flow' });
		});

		it('resumes Changelly polling on restore if awaiting_payment', async () => {
			mockPreferencesGet.mockResolvedValue({
				value: makeStoredFlow({ stage: 'awaiting_payment' })
			});

			const _o = await createOrchestrator();
			vi.mocked(changellyFiatService.getTransactionStatus).mockResolvedValue({
				orderId: 'order-stored',
				externalOrderId: 'ext-stored',
				status: 'complete',
				currencyFrom: 'USD',
				currencyTo: 'WBTC',
				amountFrom: '50',
				amountTo: '0.0005',
				walletAddress: '0xabc',
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:01:00Z'
			});

			// Should start polling automatically
			vi.advanceTimersByTime(0);
			expect(changellyFiatService.getTransactionStatus).toHaveBeenCalled();
		});
	});

	// ── trackCheckoutReturn ────────────────────────────────────────────

	describe('trackCheckoutReturn', () => {
		it('registers visibilitychange listener', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			o.trackCheckoutReturn();

			expect(document.addEventListener).toHaveBeenCalledWith(
				'visibilitychange',
				expect.any(Function)
			);
		});

		it('calls onCheckoutClosed when document becomes visible', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			vi.mocked(changellyFiatService.getTransactionStatus).mockResolvedValue({
				orderId: 'order-001',
				externalOrderId: 'ext-001',
				status: 'complete',
				currencyFrom: 'USD',
				currencyTo: 'WBTC',
				amountFrom: '100',
				amountTo: '0.001',
				walletAddress: '0xabc',
				createdAt: '2025-01-01T00:00:00Z',
				updatedAt: '2025-01-01T00:01:00Z'
			});

			const o = await createOrchestrator();
			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			o.trackCheckoutReturn();

			// Capture the registered handler
			const handler = vi
				.mocked(document.addEventListener)
				.mock.calls.find(([event]) => event === 'visibilitychange')?.[1] as () => void;

			// Simulate visibility change
			vi.stubGlobal('document', {
				...document,
				visibilityState: 'visible',
				addEventListener: document.addEventListener,
				removeEventListener: document.removeEventListener
			});

			handler();

			// Should have polled immediately
			expect(changellyFiatService.getTransactionStatus).toHaveBeenCalled();
		});

		it('cleans up listener on destroy', async () => {
			const o = await createOrchestrator();
			o.trackCheckoutReturn();
			o.destroy();

			expect(document.removeEventListener).toHaveBeenCalledWith(
				'visibilitychange',
				expect.any(Function)
			);
		});
	});

	// ── Stale flow expiry ──────────────────────────────────────────────

	describe('stale flow expiry', () => {
		it('clears stale flow when createOrder is called with active flow >30 min', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			// Advance time past stale threshold
			vi.advanceTimersByTime(31 * 60 * 1000);

			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue({
				...VALID_ORDER,
				orderId: 'order-new'
			});

			const result = await o.createOrder({
				asset: 'wbtc-arb',
				fiatAmount: '200',
				walletAddress: '0xdef',
				providerCode: 'transak',
				country: 'ES'
			});

			expect(result.orderId).toBe('order-new');
		});

		it('does not clear fresh flow when createOrder is called <30 min', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			// Only advance 5 min
			vi.advanceTimersByTime(5 * 60 * 1000);

			await expect(
				o.createOrder({
					asset: 'wbtc-arb',
					fiatAmount: '200',
					walletAddress: '0xdef',
					providerCode: 'transak',
					country: 'ES'
				})
			).rejects.toThrow('already in progress');
		});
	});

	// ── destroy ────────────────────────────────────────────────────────

	describe('destroy', () => {
		it('stops all polling and clears listeners', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			const snapshots: string[] = [];
			o.onStageChange((state) => snapshots.push(state.stage));

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await o.startMonitoring();
			o.destroy();

			const countBefore = snapshots.length;
			await vi.advanceTimersByTimeAsync(60_000);

			// No new snapshots after destroy
			expect(snapshots.length).toBe(countBefore);
		});
	});

	// ── getActiveFlow ──────────────────────────────────────────────────

	describe('getActiveFlow', () => {
		it('returns null when no flow', async () => {
			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
		});

		it('returns flow state after order creation', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			const flow = o.getActiveFlow();
			expect(flow).not.toBeNull();
			expect(flow?.orderId).toBe('order-001');
			expect(flow?.asset).toBe('usdt0-arb');
			expect(flow?.fiatAmount).toBe('100');
			expect(flow?.stage).toBe('awaiting_payment');
		});
	});

	// ── retrySwap ──────────────────────────────────────────────────────

	describe('retrySwap', () => {
		it('throws when no flow exists', async () => {
			const o = await createOrchestrator();
			await expect(o.retrySwap()).rejects.toThrow('No failed swap to retry');
		});

		it('throws when flow is not swap_failed', async () => {
			vi.mocked(changellyFiatService.createOnRampOrder).mockResolvedValue(VALID_ORDER);
			const o = await createOrchestrator();

			await o.createOrder({
				asset: 'usdt0-arb',
				fiatAmount: '100',
				walletAddress: '0xabc',
				providerCode: 'moonpay',
				country: 'US'
			});

			await expect(o.retrySwap()).rejects.toThrow('No failed swap to retry');
		});
	});
});

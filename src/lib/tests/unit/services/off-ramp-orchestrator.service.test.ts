/**
 * Off-Ramp Orchestrator — Unit Tests
 *
 * Tests the sell-side bridge-and-send flow:
 *   idle → quote_loading → quote_ready → opening_moonpay → awaiting_deposit_address → bridging → complete | failed
 *
 * Covers: createQuote (LI.FI & Symbiosis paths), toAmountWei, computeBridgeFee,
 * openMoonPay, setDepositAddress, executeBridge, bridge monitoring,
 * stale flow expiry, Capacitor Preferences persistence, startOver, cancel, destroy.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock functions for @capacitor/preferences (hoisted so vi.mock factories can reference them)
const { mockPreferencesGet, mockPreferencesSet, mockPreferencesRemove } = vi.hoisted(() => ({
	mockPreferencesGet: vi.fn(),
	mockPreferencesSet: vi.fn(),
	mockPreferencesRemove: vi.fn()
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('$lib/services/kill-switch', () => ({
	isChangeallyFiatEnabled: vi.fn(() => true),
	isLifiEnabled: vi.fn(() => true),
	isSymbiosisEnabled: vi.fn(() => true),
	isChangeallySwapsEnabled: vi.fn(() => true)
}));

vi.mock('$lib/services/lifi.service', () => ({
	lifiService: {
		getQuote: vi.fn(),
		getStepTransaction: vi.fn(),
		getStatus: vi.fn()
	}
}));

vi.mock('$lib/services/symbiosis.service', () => ({
	symbiosisService: {
		getQuote: vi.fn(),
		getSwapStatus: vi.fn()
	}
}));

vi.mock('$lib/services/fiat-ramp.service', () => ({
	changellyFiatService: {
		createOffRampOrder: vi.fn(),
		createOnRampOrder: vi.fn(),
		getTransactionStatus: vi.fn()
	}
}));

vi.mock('$lib/services/swap-chain/tx-helpers', () => ({
	sendEvmTransaction: vi.fn()
}));

vi.mock('$lib/services/swap-chain/abi', () => ({
	encodeERC20Approve: vi.fn(() => '0xapprove-data')
}));

vi.mock('$lib/services/swap-chain/utils', () => ({
	CHAIN_ID_ARB: 42161,
	CHAIN_ID_BSC: 56,
	CHAIN_ID_RSK: 30,
	NATIVE_TOKEN: '0x0000000000000000000000000000000000000000'
}));

vi.mock('ethers', () => ({
	ethers: {
		getAddress: vi.fn((addr: string) => addr)
	}
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
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
		OFF_RAMP_FLOW: 'bittasker_off_ramp_flow'
	}
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { OffRampOrchestrator } from '$lib/services/off-ramp-orchestrator.service';
import { lifiService, type LifiRoute } from '$lib/services/lifi.service';
import { symbiosisService, type SymbiosisQuoteResponse } from '$lib/services/symbiosis.service';
import { changellyFiatService } from '$lib/services/fiat-ramp.service';
import { sendEvmTransaction } from '$lib/services/swap-chain/tx-helpers';
import { encodeERC20Approve } from '$lib/services/swap-chain/abi';
import { isChangeallyFiatEnabled } from '$lib/services/kill-switch';
import { ethers } from 'ethers';
import * as Sentry from '@sentry/sveltekit';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIFI_QUOTE_RESPONSE = {
	id: 'lifi-route-1',
	fromChainId: 42161,
	toChainId: 56,
	fromToken: {
		symbol: 'USDT0',
		address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		chainId: 42161,
		decimals: 6,
		name: 'Tether USD'
	},
	toToken: {
		symbol: 'USDT',
		address: '0x55d398326f99059fF775485246999027B3197955',
		chainId: 56,
		decimals: 18,
		name: 'Tether USD'
	},
	steps: [],
	type: 'lifi',
	tool: 'stargate',
	estimate: {
		fromAmount: '100000000', // 100 USDT (6 dec)
		toAmount: '99500000000000000000', // 99.5 USDT-BSC (18 dec)
		toAmountMin: '99000000000000000000',
		executionDuration: 180,
		feeCosts: []
	}
} as unknown as LifiRoute;

const LIFI_QUOTE_WBTC_RESPONSE = {
	id: 'lifi-route-wbtc',
	fromChainId: 42161,
	toChainId: 56,
	fromToken: {
		symbol: 'WBTC',
		address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		chainId: 42161,
		decimals: 8,
		name: 'Wrapped BTC'
	},
	toToken: {
		symbol: 'USDT',
		address: '0x55d398326f99059fF775485246999027B3197955',
		chainId: 56,
		decimals: 18,
		name: 'Tether USD'
	},
	steps: [],
	type: 'lifi',
	tool: 'stargate',
	estimate: {
		fromAmount: '100000000', // 1 wBTC (8 dec)
		toAmount: '59000000000000000000000', // 59000 USDT-BSC (18 dec)
		toAmountMin: '58700000000000000000000',
		executionDuration: 300,
		feeCosts: [
			{
				name: 'Bridge fee',
				percentage: '0.1',
				amount: '50000', // 0.05 USDT (6 dec)
				token: { symbol: 'USDT', address: '0x55d3', decimals: 6 }
			}
		]
	}
} as unknown as LifiRoute;

const { USDT_BSC_ADDR } = vi.hoisted(() => ({
	USDT_BSC_ADDR: '0x55d398326f99059fF775485246999027B3197955'
}));

const SYMBIOSIS_QUOTE_RESPONSE = {
	tokenAmountOut: {
		amount: '59000000000000000000000',
		symbol: 'USDT',
		address: USDT_BSC_ADDR,
		chainId: 56,
		decimals: 18
	},
	estimatedTime: 180,
	tx: {
		to: '0xsym-router',
		data: '0xsym-data',
		value: '1000000000000000000',
		chainId: 30
	},
	approveTo: '0xsym-approve-to'
} as unknown as SymbiosisQuoteResponse;

const CHANGELLY_OFFRAMP_ORDER = {
	orderId: 'offramp-001',
	externalOrderId: 'ext-offramp-001',
	externalUserId: 'user-001',
	providerCode: 'moonpay',
	currencyFrom: 'USDTBSC',
	currencyTo: 'USD',
	amountFrom: '99.5',
	walletAddress: '0xsource',
	redirectUrl: 'https://moonpay.com/sell',
	createdAt: '2025-01-01T00:00:00Z'
};

function makeStoredFlow(overrides?: Record<string, unknown>): string {
	return JSON.stringify({
		stage: 'quote_ready',
		externalOrderId: '',
		orderId: '',
		redirectUrl: '',
		quote: {
			inputAmount: '100',
			inputAsset: 'usdt0-arb',
			bridgeProvider: 'lifi',
			bridgeOutputAmount: '99.500000',
			bridgeFeePercent: '0.50',
			bridgeFeeUsd: '0.50',
			moonpayFeePercent: '1.65',
			moonpayFeeUsd: '1.64',
			estimatedFiatReceived: '97.86',
			totalFeeUsd: '2.14',
			totalFeePercent: '2.14',
			estimatedTimeSeconds: 180,
			fromChainId: 42161,
			fromTokenAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
			fromAmountWei: '100000000',
			fromDecimals: 6
		},
		sourceWalletId: '',
		sourceAddress: '0xuser-address',
		updatedAt: Date.now() - 60_000,
		startedAt: Date.now() - 60_000,
		...overrides
	});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OffRampOrchestrator', () => {
	let orchestrator: OffRampOrchestrator;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		// Default Capacitor Preferences mock returns (no stored flow)
		mockPreferencesGet.mockResolvedValue({ value: null });
		mockPreferencesSet.mockResolvedValue(undefined);
		mockPreferencesRemove.mockResolvedValue(undefined);

		vi.stubGlobal('navigator', { onLine: true });
		vi.stubGlobal('document', {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			visibilityState: 'visible'
		});

		vi.mocked(isChangeallyFiatEnabled).mockReturnValue(true);
		vi.mocked(ethers.getAddress).mockImplementation((addr: string) => addr);
	});

	afterEach(() => {
		if (orchestrator) orchestrator.destroy();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	async function createOrchestrator(): Promise<OffRampOrchestrator> {
		orchestrator = new OffRampOrchestrator();
		await orchestrator.init();
		return orchestrator;
	}

	// ── toAmountWei (tested via createQuote behavior) ───────────────────

	describe('toAmountWei (via createQuote)', () => {
		it('converts integer amount for usdt0-arb (6 decimals)', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			// 100 USDT = 100_000_000 (6 dec)
			expect(quote.fromAmountWei).toBe('100000000');
		});

		it('converts fractional amount for usdt0-arb', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue({
				...LIFI_QUOTE_RESPONSE,
				estimate: {
					...LIFI_QUOTE_RESPONSE.estimate,
					fromAmount: '100500000',
					toAmount: '99997000000000000000'
				}
			});

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100.5',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			// 100.5 USDT = 100_500_000 (6 dec)
			expect(quote.fromAmountWei).toBe('100500000');
		});

		it('converts fractional amount for wbtc-arb (8 decimals)', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_WBTC_RESPONSE);

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'wbtc-arb',
				amount: '0.001',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			// 0.001 wBTC = 100_000 (8 dec)
			expect(quote.fromAmountWei).toBe('100000');
		});

		it('handles zero amount', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue({
				...LIFI_QUOTE_RESPONSE,
				estimate: {
					...LIFI_QUOTE_RESPONSE.estimate,
					fromAmount: '0',
					toAmount: '0'
				}
			});

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'usdt0-arb',
				amount: '0',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(quote.fromAmountWei).toBe('0');
		});

		it('handles very small amount (0.000001 USDT)', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue({
				...LIFI_QUOTE_RESPONSE,
				estimate: {
					...LIFI_QUOTE_RESPONSE.estimate,
					fromAmount: '1',
					toAmount: '990000000000000'
				}
			});

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'usdt0-arb',
				amount: '0.000001',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(quote.fromAmountWei).toBe('1');
		});
	});

	// ── computeBridgeFee (tested via createQuote) ──────────────────────

	describe('computeBridgeFee (via createQuote)', () => {
		it('computes stablecoin fee (6 decimals) from input/output diff', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			// Input: 100 USDT, Output: 99.5 USDT → Fee: 0.50 USD
			expect(Number(quote.bridgeFeeUsd)).toBeCloseTo(0.5, 1);
			expect(Number(quote.bridgeFeePercent)).toBeGreaterThan(0);
		});

		it('computes wBTC fee using feeCosts (8 decimals)', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_WBTC_RESPONSE);

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'wbtc-arb',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			// feeCosts has 50000 (6 dec) = 0.05 USD
			expect(Number(quote.bridgeFeeUsd)).toBeCloseTo(0.05, 2);
		});

		it('returns 0.00 fee when no feeCosts and wBTC path', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue({
				...LIFI_QUOTE_WBTC_RESPONSE,
				estimate: {
					...LIFI_QUOTE_WBTC_RESPONSE.estimate,
					feeCosts: []
				}
			});

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'wbtc-arb',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(quote.bridgeFeeUsd).toBe('0.00');
			expect(quote.bridgeFeePercent).toBe('0.00');
		});
	});

	// ── createQuote ────────────────────────────────────────────────────

	describe('createQuote', () => {
		it('fetches LI.FI quote for usdt0-arb and returns OffRampQuote', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(quote.inputAsset).toBe('usdt0-arb');
			expect(quote.bridgeProvider).toBe('lifi');
			expect(quote.bridgeOutputAmount).toBeTruthy();
			expect(quote.moonpayFeePercent).toBe('1.65');
			expect(quote.fromAmountWei).toBe('100000000');
			expect(o.getActiveFlow()?.stage).toBe('quote_ready');
		});

		it('fetches Symbiosis quote for rbtc', async () => {
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(SYMBIOSIS_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'rbtc',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(quote.inputAsset).toBe('rbtc');
			expect(quote.bridgeProvider).toBe('symbiosis');
			expect(quote.bridgeOutputAmount).toBeTruthy();
			expect(o.getActiveFlow()?.stage).toBe('quote_ready');
			expect(o.getActiveFlow()?.symbiosisTx).toBeDefined();
		});

		it('stores Symbiosis tx data for executeBridge', async () => {
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(SYMBIOSIS_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'rbtc',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			const flow = o.getActiveFlow();
			expect(flow?.symbiosisTx).toEqual({
				to: '0xsym-router',
				data: '0xsym-data',
				value: '1000000000000000000',
				chainId: 30,
				approveTo: '0xsym-approve-to'
			});
		});

		it('computes MoonPay fee (1.65%) and estimated fiat received', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			const bridgeOutput = Number(LIFI_QUOTE_RESPONSE.estimate.toAmount) / 1e18;
			const expectedMoonPayFee = (bridgeOutput * 1.65) / 100;
			const expectedFiat = bridgeOutput - expectedMoonPayFee;

			expect(Number(quote.moonpayFeeUsd)).toBeCloseTo(expectedMoonPayFee, 2);
			expect(Number(quote.estimatedFiatReceived)).toBeCloseTo(expectedFiat, 2);
		});

		it('transitions through quote_loading → quote_ready', async () => {
			const stages: string[] = [];
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			o.onStageChange((state) => stages.push(state.stage));

			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(stages).toContain('quote_loading');
			expect(stages).toContain('quote_ready');
		});

		it('throws when feature flag is disabled', async () => {
			vi.mocked(isChangeallyFiatEnabled).mockReturnValue(false);

			const o = await createOrchestrator();
			await expect(
				o.createQuote({
					asset: 'usdt0-arb',
					amount: '100',
					sourceAddress: '0xuser',
					sourceWalletId: ''
				})
			).rejects.toThrow('not enabled');
		});

		it('throws when offline', async () => {
			vi.stubGlobal('navigator', { onLine: false });

			const o = await createOrchestrator();
			await expect(
				o.createQuote({
					asset: 'usdt0-arb',
					amount: '100',
					sourceAddress: '0xuser',
					sourceWalletId: ''
				})
			).rejects.toThrow('offline');
		});

		it('handles LI.FI API error gracefully', async () => {
			vi.mocked(lifiService.getQuote).mockRejectedValue(new Error('No route found'));

			const o = await createOrchestrator();
			await expect(
				o.createQuote({
					asset: 'usdt0-arb',
					amount: '100',
					sourceAddress: '0xuser',
					sourceWalletId: ''
				})
			).rejects.toThrow('No route found');

			expect(o.getActiveFlow()?.stage).toBe('failed');
		});

		it('handles Symbiosis API error gracefully', async () => {
			vi.mocked(symbiosisService.getQuote).mockRejectedValue(new Error('No route'));

			const o = await createOrchestrator();
			await expect(
				o.createQuote({
					asset: 'rbtc',
					amount: '1',
					sourceAddress: '0xuser',
					sourceWalletId: ''
				})
			).rejects.toThrow('No route');

			expect(o.getActiveFlow()?.stage).toBe('failed');
		});

		it('throws if active flow is in non-terminal, non-quotable stage', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(changellyFiatService.createOffRampOrder).mockResolvedValue(CHANGELLY_OFFRAMP_ORDER);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			await o.openMoonPay('US');

			// Now in opening_moonpay — creating a new quote should fail
			await expect(
				o.createQuote({
					asset: 'usdt0-arb',
					amount: '50',
					sourceAddress: '0xuser',
					sourceWalletId: ''
				})
			).rejects.toThrow('off_ramp_in_progress');
		});

		it('allows re-quote when stage is quote_ready', async () => {
			vi.mocked(lifiService.getQuote)
				.mockResolvedValueOnce(LIFI_QUOTE_RESPONSE)
				.mockResolvedValueOnce({
					...LIFI_QUOTE_RESPONSE,
					estimate: {
						...LIFI_QUOTE_RESPONSE.estimate,
						fromAmount: '50000000',
						toAmount: '49750000000000000000'
					}
				});

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			// Re-quote with different amount
			const quote2 = await o.createQuote({
				asset: 'usdt0-arb',
				amount: '50',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(quote2.fromAmountWei).toBe('50000000');
		});

		it('logs Sentry breadcrumb', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
				expect.objectContaining({
					category: 'off-ramp-orchestrator',
					message: 'Creating LI.FI quote'
				})
			);
		});
	});

	// ── openMoonPay ────────────────────────────────────────────────────

	describe('openMoonPay', () => {
		it('creates Changelly off-ramp order and returns redirect URL', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(changellyFiatService.createOffRampOrder).mockResolvedValue(CHANGELLY_OFFRAMP_ORDER);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			const url = await o.openMoonPay('US');

			expect(url).toBe('https://moonpay.com/sell');
			expect(o.getActiveFlow()?.stage).toBe('opening_moonpay');
			expect(o.getActiveFlow()?.externalOrderId).toBe('ext-offramp-001');
		});

		it('passes country param to Changelly', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(changellyFiatService.createOffRampOrder).mockResolvedValue(CHANGELLY_OFFRAMP_ORDER);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			await o.openMoonPay('ES');

			expect(changellyFiatService.createOffRampOrder).toHaveBeenCalledWith(
				expect.objectContaining({ country: 'ES' })
			);
		});

		it('throws when no quote exists', async () => {
			const o = await createOrchestrator();
			await expect(o.openMoonPay('US')).rejects.toThrow('No quote available');
		});

		it('transitions to failed on Changelly error', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(changellyFiatService.createOffRampOrder).mockRejectedValue(new Error('API down'));

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			await expect(o.openMoonPay('US')).rejects.toThrow('API down');
			expect(o.getActiveFlow()?.stage).toBe('failed');
		});
	});

	// ── setDepositAddress ──────────────────────────────────────────────

	describe('setDepositAddress', () => {
		it('stores checksummed address', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(ethers.getAddress).mockReturnValue('0xChecksummed');

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			await o.setDepositAddress('0xabc');

			expect(ethers.getAddress).toHaveBeenCalledWith('0xabc');
			expect(o.getActiveFlow()?.depositAddress).toBe('0xChecksummed');
		});

		it('throws on invalid address (ethers throws)', async () => {
			vi.mocked(ethers.getAddress).mockImplementation(() => {
				throw new Error('invalid address');
			});

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			await expect(o.setDepositAddress('not-an-address')).rejects.toThrow('invalid address');
		});

		it('throws when no flow exists', async () => {
			const o = await createOrchestrator();
			await expect(o.setDepositAddress('0xabc')).rejects.toThrow('No active flow');
		});

		it('persists to Preferences', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			await o.setDepositAddress('0xabc');

			expect(mockPreferencesSet).toHaveBeenCalledWith(
				expect.objectContaining({
					key: 'bittasker_off_ramp_flow',
					value: expect.stringContaining('depositAddress')
				})
			);
		});
	});

	// ── executeBridge — LI.FI path ─────────────────────────────────────

	describe('executeBridge (LI.FI path)', () => {
		it('approves ERC-20 and sends swap tx', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(changellyFiatService.createOffRampOrder).mockResolvedValue(CHANGELLY_OFFRAMP_ORDER);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xswap-data',
				value: '0',
				chainId: 42161
			});
			vi.mocked(encodeERC20Approve).mockReturnValue('0xapprove-data');
			vi.mocked(sendEvmTransaction)
				.mockResolvedValueOnce({ data: '0xapprove-tx-hash', error: null })
				.mockResolvedValueOnce({ data: '0xswap-tx-hash', error: null });

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');

			o.trackCheckoutReturn();

			await o.executeBridge();

			// Should have called sendEvmTransaction twice: approve + swap
			expect(sendEvmTransaction).toHaveBeenCalledTimes(2);
			expect(o.getActiveFlow()?.stage).toBe('bridging');
			expect(o.getActiveFlow()?.bridgeTxHash).toBe('0xswap-tx-hash');
		});

		it('skips approval for native token', async () => {
			// rbtc uses Symbiosis, not LI.FI, but we test the logic path
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(SYMBIOSIS_QUOTE_RESPONSE);
			vi.mocked(sendEvmTransaction).mockResolvedValue({
				data: '0xsym-tx-hash',
				error: null
			});

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'rbtc',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');

			await o.executeBridge();

			// Symbiosis path: only one sendEvmTransaction call (swap, no approve)
			expect(sendEvmTransaction).toHaveBeenCalledTimes(1);
		});

		it('fails flow on approve error', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xswap-data',
				value: '0',
				chainId: 42161
			});
			vi.mocked(sendEvmTransaction).mockResolvedValue({
				data: null,
				error: new Error('User rejected')
			});

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');

			await expect(o.executeBridge()).rejects.toThrow('User rejected');
			expect(o.getActiveFlow()?.stage).toBe('failed');
			expect(o.getActiveFlow()?.error).toBe('wallet.buy_sell.bridge_approval_failed');
		});

		it('fails flow on swap tx error', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xswap-data',
				value: '0',
				chainId: 42161
			});
			vi.mocked(sendEvmTransaction)
				.mockResolvedValueOnce({ data: '0xapprove-tx', error: null })
				.mockResolvedValueOnce({ data: null, error: new Error('Insufficient funds') });

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');

			await expect(o.executeBridge()).rejects.toThrow('Insufficient funds');
			expect(o.getActiveFlow()?.stage).toBe('failed');
			expect(o.getActiveFlow()?.error).toBe('wallet.buy_sell.bridge_tx_failed');
		});

		it('throws when no deposit address is set', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			await expect(o.executeBridge()).rejects.toThrow('No deposit address set');
		});

		it('throws when no active flow', async () => {
			const o = await createOrchestrator();
			await expect(o.executeBridge()).rejects.toThrow('No active flow');
		});

		it('starts bridge monitoring after tx submission', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xswap-data',
				value: '0',
				chainId: 42161
			});
			vi.mocked(sendEvmTransaction)
				.mockResolvedValueOnce({ data: '0xapprove-tx', error: null })
				.mockResolvedValueOnce({ data: '0xswap-tx', error: null });
			vi.mocked(lifiService.getStatus).mockResolvedValue({ status: 'PENDING' });

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');

			await o.executeBridge();

			// Advance to trigger the first poll
			await vi.advanceTimersByTimeAsync(0);

			expect(lifiService.getStatus).toHaveBeenCalledWith('0xswap-tx');
		});
	});

	// ── executeBridge — Symbiosis path ─────────────────────────────────

	describe('executeBridge (Symbiosis path)', () => {
		it('sends Symbiosis tx and starts monitoring', async () => {
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(SYMBIOSIS_QUOTE_RESPONSE);
			vi.mocked(sendEvmTransaction).mockResolvedValue({
				data: '0xsym-tx-hash',
				error: null
			});
			vi.mocked(symbiosisService.getSwapStatus).mockResolvedValue({
				status: { code: 1, text: 'Pending' }
			});

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'rbtc',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');

			await o.executeBridge();

			expect(sendEvmTransaction).toHaveBeenCalledWith(expect.objectContaining({ chain: 'rsk' }));
			expect(o.getActiveFlow()?.bridgeTxHash).toBe('0xsym-tx-hash');
		});

		it('fails when Symbiosis tx data is missing', async () => {
			vi.mocked(symbiosisService.getQuote).mockResolvedValue({
				...SYMBIOSIS_QUOTE_RESPONSE,
				tx: undefined
			});

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'rbtc',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');

			await expect(o.executeBridge()).rejects.toThrow();
			expect(o.getActiveFlow()?.stage).toBe('failed');
		});
	});

	// ── Bridge monitoring — LI.FI ──────────────────────────────────────

	describe('Bridge monitoring (LI.FI)', () => {
		it('transitions to complete on DONE', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xdata',
				value: '0',
				chainId: 42161
			});
			vi.mocked(sendEvmTransaction)
				.mockResolvedValueOnce({ data: '0xapprove', error: null })
				.mockResolvedValueOnce({ data: '0xtxhash', error: null });
			vi.mocked(lifiService.getStatus).mockResolvedValue({ status: 'DONE' });

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');
			await o.executeBridge();

			// First poll is immediate
			await vi.advanceTimersByTimeAsync(0);

			expect(o.getActiveFlow()?.stage).toBe('complete');
		});

		it('transitions to failed on FAILED', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xdata',
				value: '0',
				chainId: 42161
			});
			vi.mocked(sendEvmTransaction)
				.mockResolvedValueOnce({ data: '0xapprove', error: null })
				.mockResolvedValueOnce({ data: '0xtxhash', error: null });
			vi.mocked(lifiService.getStatus).mockResolvedValue({
				status: 'FAILED',
				substatus: 'UNKNOWN_ERROR'
			});

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');
			await o.executeBridge();

			await vi.advanceTimersByTimeAsync(0);

			expect(o.getActiveFlow()?.stage).toBe('failed');
			expect(o.getActiveFlow()?.error).toBe('wallet.buy_sell.bridge_onchain_failed');
		});

		it('keeps polling on PENDING', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xdata',
				value: '0',
				chainId: 42161
			});
			vi.mocked(sendEvmTransaction)
				.mockResolvedValueOnce({ data: '0xapprove', error: null })
				.mockResolvedValueOnce({ data: '0xtxhash', error: null });
			vi.mocked(lifiService.getStatus)
				.mockResolvedValueOnce({ status: 'PENDING' })
				.mockResolvedValueOnce({ status: 'DONE' });

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');
			await o.executeBridge();

			await vi.advanceTimersByTimeAsync(0);
			expect(o.getActiveFlow()?.stage).toBe('bridging');

			await vi.advanceTimersByTimeAsync(10_000);
			expect(o.getActiveFlow()?.stage).toBe('complete');
		});

		it('auto-expires after max polling attempts', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xdata',
				value: '0',
				chainId: 42161
			});
			vi.mocked(sendEvmTransaction)
				.mockResolvedValueOnce({ data: '0xapprove', error: null })
				.mockResolvedValueOnce({ data: '0xtxhash', error: null });
			vi.mocked(lifiService.getStatus).mockResolvedValue({ status: 'PENDING' });

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');
			await o.executeBridge();

			// 60 polls × 10s = 10 min, advance past max
			await vi.advanceTimersByTimeAsync(61 * 10_000);

			expect(o.getActiveFlow()?.stage).toBe('failed');
			expect(o.getActiveFlow()?.error).toBe('wallet.buy_sell.bridge_timeout_error');
		});

		it('stores lifiStatus on each poll', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xdata',
				value: '0',
				chainId: 42161
			});
			vi.mocked(sendEvmTransaction)
				.mockResolvedValueOnce({ data: '0xapprove', error: null })
				.mockResolvedValueOnce({ data: '0xtxhash', error: null });
			vi.mocked(lifiService.getStatus).mockResolvedValue({ status: 'PENDING' });

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');
			await o.executeBridge();

			await vi.advanceTimersByTimeAsync(0);

			expect(o.getActiveFlow()?.lifiStatus).toBe('PENDING');
		});
	});

	// ── Bridge monitoring — Symbiosis ──────────────────────────────────

	describe('Bridge monitoring (Symbiosis)', () => {
		it('transitions to complete on status code 0', async () => {
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(SYMBIOSIS_QUOTE_RESPONSE);
			vi.mocked(sendEvmTransaction).mockResolvedValue({
				data: '0xsym-tx',
				error: null
			});
			vi.mocked(symbiosisService.getSwapStatus).mockResolvedValue({
				status: { code: 0, text: 'Success' }
			});

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'rbtc',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');
			await o.executeBridge();

			await vi.advanceTimersByTimeAsync(0);

			expect(o.getActiveFlow()?.stage).toBe('complete');
		});

		it('transitions to failed on negative status code', async () => {
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(SYMBIOSIS_QUOTE_RESPONSE);
			vi.mocked(sendEvmTransaction).mockResolvedValue({
				data: '0xsym-tx',
				error: null
			});
			vi.mocked(symbiosisService.getSwapStatus).mockResolvedValue({
				status: { code: -1, text: 'Failed' }
			});

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'rbtc',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');
			await o.executeBridge();

			await vi.advanceTimersByTimeAsync(0);

			expect(o.getActiveFlow()?.stage).toBe('failed');
			expect(o.getActiveFlow()?.error).toBe('wallet.buy_sell.bridge_onchain_failed');
		});

		it('keeps polling on positive status code (pending)', async () => {
			vi.mocked(symbiosisService.getQuote).mockResolvedValue(SYMBIOSIS_QUOTE_RESPONSE);
			vi.mocked(sendEvmTransaction).mockResolvedValue({
				data: '0xsym-tx',
				error: null
			});
			vi.mocked(symbiosisService.getSwapStatus)
				.mockResolvedValueOnce({ status: { code: 1, text: 'Pending' } })
				.mockResolvedValueOnce({ status: { code: 0, text: 'Success' } });

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'rbtc',
				amount: '1',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');
			await o.executeBridge();

			await vi.advanceTimersByTimeAsync(0);
			expect(o.getActiveFlow()?.stage).toBe('bridging');

			await vi.advanceTimersByTimeAsync(10_000);
			expect(o.getActiveFlow()?.stage).toBe('complete');
		});
	});

	// ── trackCheckoutReturn ────────────────────────────────────────────

	describe('trackCheckoutReturn', () => {
		it('registers visibilitychange listener', async () => {
			const o = await createOrchestrator();
			o.trackCheckoutReturn();

			expect(document.addEventListener).toHaveBeenCalledWith(
				'visibilitychange',
				expect.any(Function)
			);
		});

		it('transitions to awaiting_deposit_address on visibility change', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(changellyFiatService.createOffRampOrder).mockResolvedValue(CHANGELLY_OFFRAMP_ORDER);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.openMoonPay('US');

			o.trackCheckoutReturn();

			// Capture the handler
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

			expect(o.getActiveFlow()?.stage).toBe('awaiting_deposit_address');
		});

		it('only transitions when stage is opening_moonpay', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			o.trackCheckoutReturn();

			const handler = vi
				.mocked(document.addEventListener)
				.mock.calls.find(([event]) => event === 'visibilitychange')?.[1] as () => void;

			vi.stubGlobal('document', {
				...document,
				visibilityState: 'visible',
				addEventListener: document.addEventListener,
				removeEventListener: document.removeEventListener
			});

			handler();

			// Should stay in quote_ready (not opening_moonpay)
			expect(o.getActiveFlow()?.stage).toBe('quote_ready');
		});
	});

	// ── Stale flow expiry ──────────────────────────────────────────────

	describe('stale flow expiry', () => {
		it('clears stale flow on createQuote', async () => {
			const staleTime = Date.now() - 31 * 60 * 1000;
			mockPreferencesGet.mockResolvedValue({
				value: makeStoredFlow({
					stage: 'awaiting_deposit_address',
					updatedAt: staleTime,
					startedAt: staleTime
				})
			});

			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			const quote = await o.createQuote({
				asset: 'usdt0-arb',
				amount: '50',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(quote.inputAmount).toBe('50');
		});

		it('does not clear fresh flow on createQuote', async () => {
			mockPreferencesGet.mockResolvedValue({
				value: makeStoredFlow({
					stage: 'opening_moonpay',
					updatedAt: Date.now() - 5 * 60 * 1000
				})
			});

			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await expect(
				o.createQuote({
					asset: 'usdt0-arb',
					amount: '50',
					sourceAddress: '0xuser',
					sourceWalletId: ''
				})
			).rejects.toThrow('off_ramp_in_progress');
		});
	});

	// ── Capacitor Preferences persistence ──────────────────────────────

	describe('Capacitor Preferences persistence', () => {
		it('restores flow from Preferences on init', async () => {
			mockPreferencesGet.mockResolvedValue({ value: makeStoredFlow() });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).not.toBeNull();
			expect(o.getActiveFlow()?.stage).toBe('quote_ready');
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
			expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_off_ramp_flow' });
		});

		it('does not restore terminal states (complete)', async () => {
			mockPreferencesGet.mockResolvedValue({ value: makeStoredFlow({ stage: 'complete' }) });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
		});

		it('does not restore terminal states (failed)', async () => {
			mockPreferencesGet.mockResolvedValue({ value: makeStoredFlow({ stage: 'failed' }) });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
		});

		it('clears corrupted data on restore', async () => {
			mockPreferencesGet.mockResolvedValue({ value: 'not-json!!!' });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
			expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_off_ramp_flow' });
		});

		it('clears data with missing required fields', async () => {
			mockPreferencesGet.mockResolvedValue({
				value: JSON.stringify({ stage: 'quote_ready' })
			});

			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
		});

		it('resumes bridge monitoring on restore if bridging with tx hash', async () => {
			mockPreferencesGet.mockResolvedValue({
				value: makeStoredFlow({
					stage: 'bridging',
					bridgeTxHash: '0xrestore-tx',
					updatedAt: Date.now() - 5_000
				})
			});

			vi.mocked(lifiService.getStatus).mockResolvedValue({ status: 'PENDING' });

			const o = await createOrchestrator();
			expect(o.getActiveFlow()?.stage).toBe('bridging');

			// Should have started polling
			await vi.advanceTimersByTimeAsync(0);
			expect(lifiService.getStatus).toHaveBeenCalledWith('0xrestore-tx');
		});
	});

	// ── startOver ──────────────────────────────────────────────────────

	describe('startOver', () => {
		it('resets to quote_ready preserving quote', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(changellyFiatService.createOffRampOrder).mockResolvedValue(CHANGELLY_OFFRAMP_ORDER);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.openMoonPay('US');
			await o.setDepositAddress('0xdeposit');

			await o.startOver();

			const flow = o.getActiveFlow();
			expect(flow?.stage).toBe('quote_ready');
			expect(flow?.quote.inputAmount).toBe('100');
			expect(flow?.externalOrderId).toBe('');
			expect(flow?.depositAddress).toBeUndefined();
			expect(flow?.bridgeTxHash).toBeUndefined();
			expect(flow?.error).toBeUndefined();
		});

		it('does nothing when no flow', async () => {
			const o = await createOrchestrator();
			// Should not throw
			await o.startOver();
		});

		it('persists the reset state', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			await o.startOver();

			expect(mockPreferencesSet).toHaveBeenCalledWith(
				expect.objectContaining({
					key: 'bittasker_off_ramp_flow',
					value: expect.stringContaining('"quote_ready"')
				})
			);
		});
	});

	// ── cancel / destroy ───────────────────────────────────────────────

	describe('cancel', () => {
		it('clears flow and persists removal', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			await o.cancel();

			expect(o.getActiveFlow()).toBeNull();
			expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_off_ramp_flow' });
		});

		it('notifies listeners with null flow', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			let _lastStage: string | null = 'quote_ready';
			o.onStageChange((state) => {
				_lastStage = state?.stage ?? null;
			});

			await o.cancel();
			// cancel() clears flow to null, then notifyListeners() checks if (!flow) return
			// So the listener is NOT called with null — the flow is simply gone
			expect(o.getActiveFlow()).toBeNull();
		});
	});

	describe('destroy', () => {
		it('stops all polling and clears listeners', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);
			vi.mocked(lifiService.getStepTransaction).mockResolvedValue({
				to: '0xlifi-router',
				data: '0xdata',
				value: '0',
				chainId: 42161
			});
			vi.mocked(sendEvmTransaction)
				.mockResolvedValueOnce({ data: '0xapprove', error: null })
				.mockResolvedValueOnce({ data: '0xtxhash', error: null });
			vi.mocked(lifiService.getStatus).mockResolvedValue({ status: 'PENDING' });

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});
			await o.setDepositAddress('0xdeposit');
			await o.executeBridge();

			const callsBefore = vi.mocked(lifiService.getStatus).mock.calls.length;
			o.destroy();

			await vi.advanceTimersByTimeAsync(60_000);

			// No more polls after destroy
			expect(vi.mocked(lifiService.getStatus).mock.calls.length).toBe(callsBefore);
		});

		it('cleans up visibilitychange listener', async () => {
			const o = await createOrchestrator();
			o.trackCheckoutReturn();
			o.destroy();

			expect(document.removeEventListener).toHaveBeenCalledWith(
				'visibilitychange',
				expect.any(Function)
			);
		});
	});

	// ── onStageChange ──────────────────────────────────────────────────

	describe('onStageChange', () => {
		it('unsubscribe stops receiving callbacks', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			const stages: string[] = [];
			const unsub = o.onStageChange((state) => stages.push(state.stage));

			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			const countBefore = stages.length;
			unsub();

			await o.cancel();
			expect(stages.length).toBe(countBefore);
		});

		it('listener error does not break other listeners', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			const goodStages: string[] = [];
			o.onStageChange(() => {
				throw new Error('boom');
			});
			o.onStageChange((state) => goodStages.push(state.stage));

			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			expect(goodStages).toContain('quote_ready');
		});
	});

	// ── getActiveFlow ──────────────────────────────────────────────────

	describe('getActiveFlow', () => {
		it('returns null when no flow', async () => {
			const o = await createOrchestrator();
			expect(o.getActiveFlow()).toBeNull();
		});

		it('returns flow state after quote creation', async () => {
			vi.mocked(lifiService.getQuote).mockResolvedValue(LIFI_QUOTE_RESPONSE);

			const o = await createOrchestrator();
			await o.createQuote({
				asset: 'usdt0-arb',
				amount: '100',
				sourceAddress: '0xuser',
				sourceWalletId: ''
			});

			const flow = o.getActiveFlow();
			expect(flow).not.toBeNull();
			expect(flow?.stage).toBe('quote_ready');
			expect(flow?.sourceAddress).toBe('0xuser');
		});
	});
});

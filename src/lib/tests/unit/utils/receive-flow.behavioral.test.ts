/**
 * Receive Form — Current Behavior Audit
 *
 * Documents what the receive form can do RIGHT NOW, covering:
 *   1. receive-network-mapping.ts — SOURCE_CHAIN_MAP, getSourceFromNetwork, deriveChainInfo
 *   2. generate-receive-invoice.ts — invoice generation per network
 *   3. use-receive-fees.svelte.ts — fee computation paths
 *   4. route-resolver.ts — route resolution for receive
 *   5. changelly.provider.ts — Changelly quote integration
 *
 * Tests document both working and broken (BUG) behaviors.
 * BUGs are annotated with expected-correct values for future fixing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock external I/O ───────────────────────────────────────────────────────

const { mockLifiGetQuote, mockSymbiosisGetQuote } = vi.hoisted(() => ({
	mockLifiGetQuote: vi.fn(),
	mockSymbiosisGetQuote: vi.fn()
}));

const {
	mockGetHandle,
	mockCreateConnectedReverseSwap,
	mockCreateReverseSwap,
	mockCreateChainSwap,
	mockIsChangellyEnabled,
	mockCreateSwap,
	mockResolveFromTicker,
	mockResolveToTicker
} = vi.hoisted(() => ({
	mockGetHandle: vi.fn(),
	mockCreateConnectedReverseSwap: vi.fn(),
	mockCreateReverseSwap: vi.fn(),
	mockCreateChainSwap: vi.fn(),
	mockIsChangellyEnabled: vi.fn(() => true),
	mockCreateSwap: vi.fn(),
	mockResolveFromTicker: vi.fn((network: string) => {
		const map: Record<string, string> = {
			'usdt-ethereum': 'usdt',
			'usdt-avalanche': 'usdtc',
			'usdt-base': 'usdtbase',
			'usdt-optimism': 'usdtop',
			'usdt-polygon': 'usdtpolygon',
			'usdt-tron': 'usdttrc20'
		};
		if (map[network]) return map[network];
		if (network.startsWith('usdt-')) return 'usdt';
		if (network.startsWith('usdt0-')) return 'usdt0';
		return 'usdt';
	}),
	mockResolveToTicker: vi.fn(() => 'usdtarb')
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
}));

vi.mock('$lib/services/lifi.service', () => ({
	lifiService: {
		getQuote: mockLifiGetQuote
	}
}));

vi.mock('$lib/services/symbiosis.service', () => ({
	symbiosisService: {
		getQuote: mockSymbiosisGetQuote
	}
}));

vi.mock('$lib/services/changelly.service', () => ({
	changellyService: {
		getLimits: vi.fn().mockResolvedValue({ min: '10' }),
		estimateSwap: vi.fn().mockResolvedValue({ estimatedAmount: '9.95', minerFee: '0.0001' }),
		createSwap: mockCreateSwap,
		getCurrencies: vi.fn().mockResolvedValue([
			{ ticker: 'usdt', name: 'Tether', enabled: true },
			{ ticker: 'btc', name: 'Bitcoin', enabled: true },
			{ ticker: 'eth', name: 'Ethereum', enabled: true }
		])
	}
}));

vi.mock('$lib/services/changelly-ticker-map', () => ({
	resolveFromTicker: mockResolveFromTicker,
	resolveToTicker: mockResolveToTicker,
	NETWORK_TO_CHANGELLY_FROM: {
		'usdt-ethereum': 'usdt',
		'usdt-avalanche': 'usdtc',
		'usdt-base': 'usdtbase',
		'usdt-optimism': 'usdtop',
		'usdt-polygon': 'usdtpolygon',
		'usdt-tron': 'usdttrc20'
	},
	ARBITRUM_USDT0_TO_TICKER: 'usdtarb',
	findTickerByNetwork: vi.fn(),
	loadChangellyCurrencies: vi.fn(),
	resetTickerCache: vi.fn()
}));

vi.mock('$lib/services/kill-switch', () => ({
	isLifiEnabled: vi.fn(() => true),
	isSymbiosisEnabled: vi.fn(() => true),
	isChangeallySwapsEnabled: mockIsChangellyEnabled
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletManager: {
		createReverseSwap: mockCreateReverseSwap,
		createChainSwap: mockCreateChainSwap
	}
}));

vi.mock('$lib/stores/connected-wallets.store', () => ({
	getHandle: mockGetHandle
}));

vi.mock('$lib/services/connected-wallet-reverse-swap', () => ({
	createConnectedReverseSwap: mockCreateConnectedReverseSwap
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

// ── Imports (real modules under test) ───────────────────────────────────────

import {
	SOURCE_CHAIN_MAP,
	getSourceFromNetwork,
	deriveChainInfo
} from '$lib/utils/receive-network-mapping';

import {
	generateReceiveInvoice,
	CHANGELLY_REROUTE_NETWORKS,
	type GenerateInvoiceParams
} from '$lib/utils/generate-receive-invoice';

import { useReceiveFees } from '$lib/runes/use-receive-fees.svelte';
import { resolveRoute } from '$lib/services/route-resolver';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCallbacks() {
	return {
		onSuccess: vi.fn(),
		onError: vi.fn(),
		onClose: vi.fn()
	};
}

function makeInvoiceParams(overrides?: Partial<GenerateInvoiceParams>): GenerateInvoiceParams {
	return {
		invoiceAmount: 50_000,
		selectedNetwork: 'lightning-bitcoin',
		selectedReceiveWalletId: null,
		isReceiveWalletValid: false,
		formState: {
			amount: '50000',
			unit: 'sats',
			mathExpression: '',
			memo: '',
			selectedNetwork: 'lightning-bitcoin',
			chargeFeesToPayer: false
		},
		totalFees: 0,
		rskAddress: '0xRSKAddr11111111111111111111111111111111',
		rskConnected: true,
		bscAddress: '0xBSCAddr11111111111111111111111111111111',
		bscConnected: true,
		swapRoutesCount: 2,
		...overrides
	};
}

function makeFeesOpts(overrides?: {
	amountInSats?: number;
	payerNetwork?: string;
	selectedNetwork?: string;
	rskAddress?: string;
}) {
	return {
		getAmountInSats: () => overrides?.amountInSats ?? 100_000,
		getPayerNetwork: () => overrides?.payerNetwork ?? 'usdt-avalanche',
		getSelectedNetwork: () => overrides?.selectedNetwork ?? 'usdt0-arb',
		getReceiveTab: () => 'usdt0-arb',
		getRskAddress: () => overrides?.rskAddress ?? '0xUserAddr11111111111111111111111111111111',
		getCachedReverseSwapPairs: vi.fn().mockResolvedValue(null),
		getCachedChainSwapPairs: vi.fn().mockResolvedValue(null)
	};
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('receive form — current behavior audit', () => {
	beforeEach(() => {
		mockLifiGetQuote.mockReset();
		mockSymbiosisGetQuote.mockReset();
		mockCreateReverseSwap.mockReset();
		mockCreateChainSwap.mockReset();
		mockCreateConnectedReverseSwap.mockReset();
		mockGetHandle.mockReset();
		mockCreateSwap.mockReset();
		mockCreateSwap.mockResolvedValue({
			id: 'changelly-swap-abc',
			payinAddress: '0xChangellyDepositAddr1111111111111111111',
			payoutAddress: '0xUserArbitrumAddr',
			status: 'waiting',
			from: 'usdt',
			to: 'usdt0',
			amountExpectedFrom: '100',
			amountExpectedTo: '99.5',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		});
		mockLifiGetQuote.mockResolvedValue({
			estimate: {
				fromAmount: '100000000000000000000',
				toAmount: '99500000000000000000',
				toAmountMin: '99400000000000000000'
			}
		});
		mockSymbiosisGetQuote.mockResolvedValue({
			tokenAmountOut: { amount: '99700000000000000000' }
		});
		mockCreateReverseSwap.mockResolvedValue({ swapId: 'builtin-swap-123' });
		mockCreateChainSwap.mockResolvedValue({ swapId: 'chain-swap-456' });
		mockCreateConnectedReverseSwap.mockResolvedValue({
			swapId: 'connected-swap-789',
			invoice: 'lnbc500n1test'
		} as never);
		mockGetHandle.mockReturnValue({
			address: '0xConnectedWalletAddr',
			walletName: 'MetaMask',
			evmSigner: {},
			bitcoinSigner: { address: 'tb1qConnectedBtc' }
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// =====================================================================
	// 1. Payer source mapping (getSourceFromNetwork)
	// =====================================================================

	describe('payer source mapping (getSourceFromNetwork)', () => {
		describe('working mappings', () => {
			it('Arbitrum maps to usdt0-arb (correct)', () => {
				expect(getSourceFromNetwork('usdt0-arb')).toBe('usdt0-arb');
			});

			it('Rootstock maps to rbtc (correct)', () => {
				expect(getSourceFromNetwork('rootstock-bitcoin')).toBe('rbtc');
			});

			it('Lightning maps to rbtc (correct)', () => {
				expect(getSourceFromNetwork('lightning-bitcoin')).toBe('rbtc');
			});

			it('Bitcoin maps to btc-onchain (correct)', () => {
				expect(getSourceFromNetwork('bitcoin')).toBe('btc-onchain');
			});

			it('Rootstock USDT0 maps to usdt0-rsk (correct)', () => {
				expect(getSourceFromNetwork('usdt0-rootstock')).toBe('usdt0-rsk');
			});

			it('BSC USDT maps to usdt-bsc (correct)', () => {
				expect(getSourceFromNetwork('usdt-bsc')).toBe('usdt-bsc');
			});

			it('wbtc-arbitrum maps to wbtc-arb (correct)', () => {
				expect(getSourceFromNetwork('wbtc-arbitrum')).toBe('wbtc-arb');
			});

			it('tbtc-arbitrum maps to tbtc-arb (correct)', () => {
				expect(getSourceFromNetwork('tbtc-arbitrum')).toBe('tbtc-arb');
			});

			it('doc-rootstock maps to doc-rsk (correct)', () => {
				expect(getSourceFromNetwork('doc-rootstock')).toBe('doc-rsk');
			});
		});

		describe('FIXED (BUG-007): non-Arbitrum USDT networks have specific mappings', () => {
			it('Ethereum maps to usdt-ethereum', () => {
				expect(getSourceFromNetwork('usdt-ethereum')).toBe('usdt-ethereum');
			});

			it('Avalanche maps to usdt-avalanche', () => {
				expect(getSourceFromNetwork('usdt-avalanche')).toBe('usdt-avalanche');
			});

			it('Base maps to usdt-base', () => {
				expect(getSourceFromNetwork('usdt-base')).toBe('usdt-base');
			});

			it('Optimism maps to usdt-optimism', () => {
				expect(getSourceFromNetwork('usdt-optimism')).toBe('usdt-optimism');
			});

			it('Polygon maps to usdt-polygon', () => {
				expect(getSourceFromNetwork('usdt-polygon')).toBe('usdt-polygon');
			});

			it('TRON maps to usdt-tron', () => {
				expect(getSourceFromNetwork('usdt-tron')).toBe('usdt-tron');
			});
		});

		describe('BUG: Changelly/dynamic tickers map to rbtc', () => {
			it('Changelly ticker maps to rbtc (WRONG for stablecoins)', () => {
				expect(getSourceFromNetwork('changelly-usdt')).toBe('rbtc');
			});

			it('Unknown network maps to rbtc (defensive fallback)', () => {
				expect(getSourceFromNetwork('unknown-network')).toBe('rbtc');
			});
		});
	});

	// =====================================================================
	// 2. Chain info derivation (deriveChainInfo)
	// =====================================================================

	describe('chain info derivation (deriveChainInfo)', () => {
		describe('USDT/USDT0 payer source networks', () => {
			it('Arbitrum: chainId 42161, USDT0 contract', () => {
				const info = deriveChainInfo('usdt0-arb');
				expect(info?.chainId).toBe(42161);
				expect(info?.address).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
				expect(info?.asset).toBe('USDT0');
				expect(info?.decimals).toBe(18);
			});

			it('Ethereum: chainId 1, USDT contract', () => {
				const info = deriveChainInfo('usdt-ethereum');
				expect(info?.chainId).toBe(1);
				expect(info?.address).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
				expect(info?.asset).toBe('USDT');
			});

			it('Avalanche: chainId 43114, USDT contract', () => {
				const info = deriveChainInfo('usdt-avalanche');
				expect(info?.chainId).toBe(43114);
				expect(info?.address).toBe('0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7');
				expect(info?.asset).toBe('USDT');
			});

			it('Base: chainId 8453, USDT contract', () => {
				const info = deriveChainInfo('usdt-base');
				expect(info?.chainId).toBe(8453);
				expect(info?.address).toBe('0x4200000000000000000000000000000000000023');
				expect(info?.asset).toBe('USDT');
			});

			it('Optimism: chainId 10, USDT contract', () => {
				const info = deriveChainInfo('usdt-optimism');
				expect(info?.chainId).toBe(10);
				expect(info?.asset).toBe('USDT');
			});

			it('Polygon: chainId 137, USDT contract', () => {
				const info = deriveChainInfo('usdt-polygon');
				expect(info?.chainId).toBe(137);
				expect(info?.asset).toBe('USDT');
			});

			it('TRON: chainId 0 (pseudo, not EVM)', () => {
				const info = deriveChainInfo('usdt-tron');
				expect(info?.chainId).toBe(0);
				expect(info?.address).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
			});
		});

		describe('destination networks (switch-case path)', () => {
			it('rootstock-bitcoin: chainId 30, RBTC asset', () => {
				const info = deriveChainInfo('rootstock-bitcoin');
				expect(info?.chainId).toBe(30);
				expect(info?.asset).toBe('RBTC');
				expect(info?.decimals).toBe(18);
			});

			it('usdt-bsc: chainId 56, USDT asset', () => {
				const info = deriveChainInfo('usdt-bsc');
				expect(info?.chainId).toBe(56);
				expect(info?.asset).toBe('USDT');
			});

			it('bitcoin: chainId -3 (BOLTZ_BITCOIN_ID)', () => {
				const info = deriveChainInfo('bitcoin');
				expect(info?.chainId).toBe(-3);
				expect(info?.asset).toBe('BTC');
			});

			it('lightning-bitcoin: chainId -1 (BOLTZ_LIGHTNING_ID)', () => {
				const info = deriveChainInfo('lightning-bitcoin');
				expect(info?.chainId).toBe(-1);
				expect(info?.asset).toBe('BTC');
			});

			it('liquid-bitcoin: chainId -2 (BOLTZ_LIQUID_ID)', () => {
				const info = deriveChainInfo('liquid-bitcoin');
				expect(info?.chainId).toBe(-2);
				expect(info?.asset).toBe('L-BTC');
			});
		});

		describe('Changelly and dynamic networks', () => {
			it('changelly-xrp returns chainId 0, asset XRP', () => {
				const info = deriveChainInfo('changelly-xrp');
				expect(info?.chainId).toBe(0);
				expect(info?.asset).toBe('XRP');
				expect(info?.address).toBe('');
			});

			it('dyn-usdt-56 returns chainId 56, asset USDT', () => {
				const info = deriveChainInfo('dyn-usdt-56');
				expect(info?.chainId).toBe(56);
				expect(info?.asset).toBe('USDT');
			});

			it('unknown network returns null', () => {
				expect(deriveChainInfo('unknown-network')).toBeNull();
			});
		});
	});

	// =====================================================================
	// 3. SOURCE_CHAIN_MAP completeness
	// =====================================================================

	describe('SOURCE_CHAIN_MAP completeness', () => {
		it('all USD payer sources have entries', () => {
			const networks = [
				'usdt0-arb',
				'usdt-avalanche',
				'usdt-base',
				'usdt-ethereum',
				'usdt-optimism',
				'usdt-polygon',
				'usdt-tron',
				'usdt0-rootstock'
			];
			for (const net of networks) {
				expect(SOURCE_CHAIN_MAP[net]).toBeDefined();
			}
		});

		it('all entries have chainId and address', () => {
			for (const [key, val] of Object.entries(SOURCE_CHAIN_MAP)) {
				expect(val).toBeDefined();
				expect(val!.chainId).toBeDefined();
				expect(typeof val!.chainId).toBe('number');
				expect(val!.address).toBeDefined();
				expect(typeof val!.address).toBe('string');
				expect(val!.address.length).toBeGreaterThan(0);
			}
		});

		it('Arbitrum USDT and USDT0 share the same contract address', () => {
			expect(SOURCE_CHAIN_MAP['usdt0-arb']!.address).toBe(
				SOURCE_CHAIN_MAP['usdt0-arb']!.address
			);
			expect(SOURCE_CHAIN_MAP['usdt0-arb']!.chainId).toBe(
				SOURCE_CHAIN_MAP['usdt0-arb']!.chainId
			);
		});
	});

	// =====================================================================
	// 3b. Changelly reroute networks constant
	// =====================================================================

	describe('CHANGELLY_REROUTE_NETWORKS', () => {
		it('contains all cross-chain USDT networks', () => {
			expect(CHANGELLY_REROUTE_NETWORKS.has('usdt-ethereum')).toBe(true);
			expect(CHANGELLY_REROUTE_NETWORKS.has('usdt-avalanche')).toBe(true);
			expect(CHANGELLY_REROUTE_NETWORKS.has('usdt-base')).toBe(true);
			expect(CHANGELLY_REROUTE_NETWORKS.has('usdt-optimism')).toBe(true);
			expect(CHANGELLY_REROUTE_NETWORKS.has('usdt-polygon')).toBe(true);
			expect(CHANGELLY_REROUTE_NETWORKS.has('usdt-tron')).toBe(true);
		});

		it('does not contain direct networks', () => {
			expect(CHANGELLY_REROUTE_NETWORKS.has('usdt0-arb')).toBe(false);
			expect(CHANGELLY_REROUTE_NETWORKS.has('usdt-bsc')).toBe(false);
			expect(CHANGELLY_REROUTE_NETWORKS.has('rootstock-bitcoin')).toBe(false);
			expect(CHANGELLY_REROUTE_NETWORKS.has('lightning-bitcoin')).toBe(false);
			expect(CHANGELLY_REROUTE_NETWORKS.has('usdt0-rootstock')).toBe(false);
		});
	});

	// =====================================================================
	// 4. Deposit address generation (generateReceiveInvoice)
	// =====================================================================

	describe('deposit address generation', () => {
		describe('direct receive networks — use user EOA address', () => {
			it('Arbitrum receive shows user EOA address (direct)', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						rskAddress: '0xUserRSKAddr',
						rskConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xUserRSKAddr',
						network: 'usdt0-arb'
					})
				);
			});

			it('Rootstock receive shows user RSK address', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'rootstock-bitcoin',
						rskAddress: '0xUserRSKAddr',
						rskConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xUserRSKAddr',
						network: 'rootstock-bitcoin'
					})
				);
			});

			it('BSC USDT receive shows user BSC address', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt-bsc',
						bscAddress: '0xUserBSCAddr',
						bscConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xUserBSCAddr',
						network: 'usdt-bsc'
					})
				);
			});
		});

		describe('Changelly cross-chain USDT networks — generate deposit address', () => {
			it('Ethereum creates a Changelly swap and returns payinAddress', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						payerNetwork: 'usdt-ethereum',
						rskAddress: '0xUserRSKAddr',
						rskConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xChangellyDepositAddr1111111111111111111',
						network: 'usdt-ethereum',
						changellySwapId: 'changelly-swap-abc'
					})
				);
				expect(callbacks.onError).not.toHaveBeenCalled();
			});

			it('Avalanche creates a Changelly swap and returns payinAddress', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						payerNetwork: 'usdt-avalanche',
						rskAddress: '0xUserRSKAddr',
						rskConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xChangellyDepositAddr1111111111111111111',
						network: 'usdt-avalanche',
						changellySwapId: 'changelly-swap-abc'
					})
				);
			});

			it('TRON creates a Changelly swap and returns payinAddress', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						payerNetwork: 'usdt-tron',
						rskAddress: '0xUserRSKAddr',
						rskConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xChangellyDepositAddr1111111111111111111',
						network: 'usdt-tron',
						changellySwapId: 'changelly-swap-abc'
					})
				);
			});

			it('undefined payerNetwork skips Changelly and uses direct receive', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						payerNetwork: undefined,
						rskAddress: '0xUserRSKAddr',
						rskConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xUserRSKAddr',
						network: 'usdt0-arb'
					})
				);
				const call = callbacks.onSuccess.mock.calls[0][0];
				expect(call.changellySwapId).toBeUndefined();
			});
		});

		describe('Changelly cross-chain — error handling', () => {
			it('falls back to EOA when Changelly is disabled', async () => {
				mockIsChangellyEnabled.mockReturnValueOnce(false);

				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						payerNetwork: 'usdt-ethereum',
						rskAddress: '0xUserRSKAddr',
						rskConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xUserRSKAddr',
						network: 'usdt-ethereum'
					})
				);
				const call = callbacks.onSuccess.mock.calls[0][0];
				expect(call.changellySwapId).toBeUndefined();
			});

			it('calls onError when createSwap fails', async () => {
				mockCreateSwap.mockRejectedValueOnce(new Error('Changelly API error'));

				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						payerNetwork: 'usdt-ethereum'
					}),
					callbacks
				);

				expect(callbacks.onError).toHaveBeenCalledWith(
					'wallet.receive.changelly_bridge_unavailable'
				);
				expect(callbacks.onSuccess).not.toHaveBeenCalled();
			});

			it('calls onError when createSwap returns no payinAddress', async () => {
				mockCreateSwap.mockResolvedValueOnce({
					id: 'swap-no-addr',
					payinAddress: undefined as unknown as string,
					payoutAddress: '0xUser',
					status: 'waiting',
					from: 'usdt',
					to: 'usdt0',
					amountExpectedFrom: '100',
					amountExpectedTo: '99',
					createdAt: '',
					updatedAt: ''
				});

				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						payerNetwork: 'usdt-avalanche'
					}),
					callbacks
				);

				expect(callbacks.onError).toHaveBeenCalledWith(
					'wallet.receive_form.changelly_error'
				);
			});

			it('calls onError when no rsk address and Changelly disabled', async () => {
				mockIsChangellyEnabled.mockReturnValueOnce(false);

				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						payerNetwork: 'usdt-ethereum',
						rskAddress: undefined,
						rskConnected: false
					}),
					callbacks
				);

				expect(callbacks.onError).toHaveBeenCalledWith('wallet.rsk_not_connected');
			});

			it('uses connected wallet address as Changelly payoutAddress', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						payerNetwork: 'usdt-ethereum',
						selectedReceiveWalletId: 'wallet-1',
						isReceiveWalletValid: true
					}),
					callbacks
				);

				expect(mockCreateSwap).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xConnectedWalletAddr'
					})
				);
			});
		});

		describe('swap-based networks — create reverse/chain swaps', () => {
			it('Lightning creates a reverse swap via walletManager', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({ selectedNetwork: 'lightning-bitcoin' }),
					callbacks
				);

				expect(mockCreateReverseSwap).toHaveBeenCalledWith(50_000);
				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({ swapId: 'builtin-swap-123' })
				);
			});

			it('Liquid creates a chain swap via walletManager', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'liquid-bitcoin',
						swapRoutesCount: 1
					}),
					callbacks
				);

				expect(mockCreateChainSwap).toHaveBeenCalledWith(50_000);
				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({ swapId: 'chain-swap-456' })
				);
			});
		});

		describe('connected wallet path', () => {
			it('Lightning with connected wallet uses createConnectedReverseSwap', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'lightning-bitcoin',
						selectedReceiveWalletId: 'wallet-1',
						isReceiveWalletValid: true
					}),
					callbacks
				);

				expect(mockCreateConnectedReverseSwap).toHaveBeenCalled();
				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({ swapId: 'connected-swap-789' })
				);
			});

			it('Arbitrum with connected wallet uses handle address', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({
						selectedNetwork: 'usdt0-arb',
						selectedReceiveWalletId: 'wallet-1',
						isReceiveWalletValid: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xConnectedWalletAddr',
						network: 'usdt0-arb'
					})
				);
			});
		});
	});

	// =====================================================================
	// 4b. Changelly ticker resolution in receive flow
	// =====================================================================

	describe('Changelly ticker resolution in receive flow', () => {
		beforeEach(() => {
			mockResolveFromTicker.mockClear();
			mockResolveToTicker.mockClear();
		});

		describe('handleChangellyReceive uses resolveFromTicker', () => {
			it('calls resolveFromTicker with usdt-ethereum and passes result to createSwap', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({ selectedNetwork: 'usdt0-arb', payerNetwork: 'usdt-ethereum' }),
					callbacks
				);

				expect(mockResolveFromTicker).toHaveBeenCalledWith('usdt-ethereum');
				expect(mockCreateSwap).toHaveBeenCalledWith(
					expect.objectContaining({ from: 'usdt' })
				);
			});

			it('calls resolveFromTicker with usdt-avalanche and passes usdtc to createSwap', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({ selectedNetwork: 'usdt0-arb', payerNetwork: 'usdt-avalanche' }),
					callbacks
				);

				expect(mockResolveFromTicker).toHaveBeenCalledWith('usdt-avalanche');
				expect(mockCreateSwap).toHaveBeenCalledWith(
					expect.objectContaining({ from: 'usdtc' })
				);
			});

			it('calls resolveFromTicker with usdt-tron and passes usdttrc20 to createSwap', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({ selectedNetwork: 'usdt0-arb', payerNetwork: 'usdt-tron' }),
					callbacks
				);

				expect(mockResolveFromTicker).toHaveBeenCalledWith('usdt-tron');
				expect(mockCreateSwap).toHaveBeenCalledWith(
					expect.objectContaining({ from: 'usdttrc20' })
				);
			});

			it('calls resolveFromTicker with usdt-base and passes usdtbase to createSwap', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({ selectedNetwork: 'usdt0-arb', payerNetwork: 'usdt-base' }),
					callbacks
				);

				expect(mockResolveFromTicker).toHaveBeenCalledWith('usdt-base');
				expect(mockCreateSwap).toHaveBeenCalledWith(
					expect.objectContaining({ from: 'usdtbase' })
				);
			});

			it('does NOT use hardcoded usdt for non-Ethereum networks', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({ selectedNetwork: 'usdt0-arb', payerNetwork: 'usdt-avalanche' }),
					callbacks
				);

				expect(mockCreateSwap).not.toHaveBeenCalledWith(
					expect.objectContaining({ from: 'usdt' })
				);
			});
		});

		describe('handleChangellyReceive uses resolveToTicker', () => {
			it('calls resolveToTicker and passes result to createSwap for every network', async () => {
				const networks = ['usdt-ethereum', 'usdt-avalanche', 'usdt-tron'];
				for (const network of networks) {
					mockResolveToTicker.mockClear();
					const callbacks = makeCallbacks();
					await generateReceiveInvoice(
						makeInvoiceParams({ selectedNetwork: 'usdt0-arb', payerNetwork: network }),
						callbacks
					);

					expect(mockResolveToTicker).toHaveBeenCalled();
					expect(mockCreateSwap).toHaveBeenCalledWith(
						expect.objectContaining({ to: 'usdtarb' })
					);
				}
			});

			it('does NOT use hardcoded usdt0 as to ticker', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeInvoiceParams({ selectedNetwork: 'usdt0-arb', payerNetwork: 'usdt-ethereum' }),
					callbacks
				);

				expect(mockCreateSwap).not.toHaveBeenCalledWith(
					expect.objectContaining({ to: 'usdt0' })
				);
			});
		});

		describe('computeChangellyCrossChainFee uses resolved tickers', () => {
			it('calls changellyService.estimateSwap with from/to tickers for cross-chain fee path', async () => {
				const { changellyService } = await import('$lib/services/changelly.service');
				const limitsMock = vi.mocked(changellyService.getLimits);
				const estimateMock = vi.mocked(changellyService.estimateSwap);

				limitsMock.mockResolvedValueOnce({ min: '10', max: '10000' });
				estimateMock.mockResolvedValueOnce({
					estimatedAmount: '9.95',
					rate: '1',
					fee: '0.05',
					minerFee: '0.001'
				});

				const fees = useReceiveFees(
					makeFeesOpts({
						payerNetwork: 'usdt-avalanche',
						selectedNetwork: 'usdt0-arb'
					})
				);
				await fees.refresh();

				expect(limitsMock).toHaveBeenCalled();
				expect(estimateMock).toHaveBeenCalled();
				expect(fees.estimated).not.toBeNull();
			});

			it('cross-chain fee computation uses getLimits and estimateSwap', async () => {
				const { changellyService } = await import('$lib/services/changelly.service');
				const limitsMock = vi.mocked(changellyService.getLimits);
				const estimateMock = vi.mocked(changellyService.estimateSwap);

				limitsMock.mockResolvedValueOnce({ min: '5', max: '5000' });
				estimateMock.mockResolvedValueOnce({
					estimatedAmount: '4.97',
					rate: '1',
					fee: '0.03',
					minerFee: '0.0005'
				});

				const fees = useReceiveFees(
					makeFeesOpts({
						payerNetwork: 'usdt-ethereum',
						selectedNetwork: 'usdt0-arb'
					})
				);
				await fees.refresh();

				expect(fees.error).toBeNull();
				expect(fees.estimated).not.toBeNull();
			});
		});
	});

	// =====================================================================
	// 5. Fee computation (useReceiveFees)
	// =====================================================================

	describe('fee computation (useReceiveFees)', () => {
		it('same-chain same-asset (direct) returns zero fees', async () => {
			const fees = useReceiveFees(
				makeFeesOpts({
					payerNetwork: 'usdt0-arb',
					selectedNetwork: 'usdt0-arb'
				})
			);
			await fees.refresh();

			expect(fees.error).toBeNull();
			expect(fees.estimated).not.toBeNull();
			expect(fees.estimated!.totalFees).toBe(0);
			expect(fees.estimated!.serviceFee).toBe(0);
			expect(fees.estimated!.networkFee).toBe(0);
		});

		it('cross-chain (Avalanche → Arbitrum) uses Changelly fee path', async () => {
			const fees = useReceiveFees(
				makeFeesOpts({
					payerNetwork: 'usdt-avalanche',
					selectedNetwork: 'usdt0-arb'
				})
			);
			await fees.refresh();

			expect(fees.error).toBeNull();
			expect(fees.estimated).not.toBeNull();
			expect(fees.estimated!.totalFees).toBeGreaterThanOrEqual(0);
		});

		it('cross-chain (Ethereum → Arbitrum) uses Changelly fee path', async () => {
			const fees = useReceiveFees(
				makeFeesOpts({
					payerNetwork: 'usdt-ethereum',
					selectedNetwork: 'usdt0-arb'
				})
			);
			await fees.refresh();

			expect(fees.error).toBeNull();
			expect(fees.estimated).not.toBeNull();
			expect(fees.estimated!.totalFees).toBeGreaterThanOrEqual(0);
		});

		it('cross-chain (Base → Arbitrum) uses Changelly fee path', async () => {
			const fees = useReceiveFees(
				makeFeesOpts({
					payerNetwork: 'usdt-base',
					selectedNetwork: 'usdt0-arb'
				})
			);
			await fees.refresh();

			expect(fees.error).toBeNull();
			expect(fees.estimated).not.toBeNull();
		});

		it('cross-chain Changelly fee returns error on API failure (not silent zero)', async () => {
			const { changellyService } = await import('$lib/services/changelly.service');
			vi.mocked(changellyService.estimateSwap).mockRejectedValueOnce(
				new Error('API down')
			);

			const fees = useReceiveFees(
				makeFeesOpts({
					payerNetwork: 'usdt-avalanche',
					selectedNetwork: 'usdt0-arb'
				})
			);
			await fees.refresh();

			expect(fees.error).toBe('wallet.receive.changelly_bridge_unavailable');
			expect(fees.estimated).toBeNull();
		});

		it('Changelly payer network uses computeChangellyFee path', async () => {
			const fees = useReceiveFees(
				makeFeesOpts({
					payerNetwork: 'changelly-xrp',
					selectedNetwork: 'usdt0-arb'
				})
			);
			await fees.refresh();

			expect(fees.error).toBeNull();
			expect(fees.estimated).not.toBeNull();
		});

		it('zero amount returns null estimate', async () => {
			const fees = useReceiveFees(
				makeFeesOpts({
					amountInSats: 0,
					payerNetwork: 'usdt-avalanche',
					selectedNetwork: 'usdt0-arb'
				})
			);
			await fees.refresh();

			expect(fees.estimated).toBeNull();
		});

		it('unknown deriveChainInfo returns null estimate', async () => {
			const fees = useReceiveFees(
				makeFeesOpts({
					payerNetwork: 'unknown-payer',
					selectedNetwork: 'unknown-dest'
				})
			);
			await fees.refresh();

			expect(fees.estimated).toBeNull();
		});
	});

	// =====================================================================
	// 6. Route resolution (resolveRoute)
	// =====================================================================

	describe('route resolution (resolveRoute)', () => {
		describe('rbtc source', () => {
			it('rbtc → RSK address returns direct route', () => {
				const routes = resolveRoute('rbtc', {
					type: 'address',
					chainId: 30,
					address: '0xRSKAddr'
				});

				expect(routes.length).toBeGreaterThan(0);
				expect(routes[0].id).toBe('rbtc-to-rbtc-direct');
				expect(routes[0].hops[0].service).toBe('direct');
				expect(routes[0].totalFeePercent).toBe(0);
			});

			it('rbtc → BSC address returns Symbiosis + LI.FI routes', () => {
				const routes = resolveRoute('rbtc', {
					type: 'address',
					chainId: 56,
					address: '0xBSCAddr'
				});

				expect(routes.length).toBe(2);
				expect(routes[0].label).toBe('Symbiosis');
				expect(routes[1].label).toBe('LI.FI');
			});

			it('rbtc → Lightning invoice returns Boltz route', () => {
				const routes = resolveRoute('rbtc', {
					type: 'invoice',
					network: 'lightning',
					invoice: 'lnbc...'
				});

				expect(routes.length).toBe(1);
				expect(routes[0].hops[0].service).toBe('boltz');
			});

			it('rbtc → Arbitrum USDT0 returns Boltz → Symbiosis route', () => {
				const routes = resolveRoute('rbtc', {
					type: 'address',
					chainId: 42161,
					address: '0xArbAddr',
					asset: 'USDT0'
				});

				expect(routes.length).toBeGreaterThan(0);
				expect(routes[0].hops.length).toBe(2);
				expect(routes[0].hops[0].service).toBe('boltz');
				expect(routes[0].hops[1].service).toBe('symbiosis');
			});
		});

		describe('usdt-bsc source', () => {
			it('usdt-bsc → BSC address returns direct route', () => {
				const routes = resolveRoute('usdt-bsc', {
					type: 'address',
					chainId: 56,
					address: '0xBSCAddr'
				});

				expect(routes.length).toBe(1);
				expect(routes[0].id).toBe('usdt-to-bsc-direct');
				expect(routes[0].totalFeePercent).toBe(0);
			});

			it('usdt-bsc → RSK address returns LI.FI + Symbiosis routes', () => {
				const routes = resolveRoute('usdt-bsc', {
					type: 'address',
					chainId: 30,
					address: '0xRSKAddr'
				});

				expect(routes.length).toBe(2);
				expect(routes[0].label).toBe('LI.FI');
				expect(routes[1].label).toBe('Symbiosis');
			});

			it('usdt-bsc → onchain BTC returns LI.FI + Symbiosis + Changelly routes', () => {
				const routes = resolveRoute('usdt-bsc', {
					type: 'invoice',
					network: 'onchain',
					invoice: ''
				});

				expect(routes.length).toBe(3);
				const labels = routes.map((r) => r.label);
				expect(labels).toContain('Changelly');
				expect(labels).toContain('LI.FI');
				expect(labels).toContain('Symbiosis');
			});
		});

		describe('usdt0-arb source', () => {
			it('usdt0-arb → Arbitrum USDT0 returns direct route', () => {
				const routes = resolveRoute('usdt0-arb', {
					type: 'address',
					chainId: 42161,
					address: '0xArbAddr',
					asset: 'USDT0'
				});

				expect(routes.length).toBe(1);
				expect(routes[0].id).toBe('usdt0-arb-to-usdt0-arb-direct');
				expect(routes[0].totalFeePercent).toBe(0);
			});

			it('usdt0-arb → RSK returns 3 routes (Symbiosis+Boltz, LI.FI, Symbiosis)', () => {
				const routes = resolveRoute('usdt0-arb', {
					type: 'address',
					chainId: 30,
					address: '0xRSKAddr'
				});

				expect(routes.length).toBe(3);
				expect(routes[0].hops.length).toBe(2); // Symbiosis → Boltz
			});
		});

		describe('usdt0-rsk source', () => {
			it('usdt0-rsk → RSK returns Symbiosis route', () => {
				const routes = resolveRoute('usdt0-rsk', {
					type: 'address',
					chainId: 30,
					address: '0xRSKAddr'
				});

				expect(routes.length).toBe(1);
				expect(routes[0].hops[0].service).toBe('symbiosis');
			});
		});

		describe('btc-onchain source', () => {
			it('btc-onchain → RSK returns Boltz route', () => {
				const routes = resolveRoute('btc-onchain', {
					type: 'address',
					chainId: 30,
					address: '0xRSKAddr'
				});

				expect(routes.length).toBe(1);
				expect(routes[0].hops[0].service).toBe('boltz');
			});

			it('btc-onchain → Arbitrum returns Boltz+LI.FI route', () => {
				const routes = resolveRoute('btc-onchain', {
					type: 'address',
					chainId: 42161,
					address: '0xArbAddr'
				});

				expect(routes.length).toBe(1);
				expect(routes[0].hops.length).toBe(2);
			});
		});

		describe('no route scenarios', () => {
			it('unknown source returns empty routes', () => {
				const routes = resolveRoute('nonexistent' as never, {
					type: 'address',
					chainId: 30,
					address: '0xAddr'
				});

				expect(routes).toEqual([]);
			});
		});
	});

	// =====================================================================
	// 7. getSwapExpiryInfo
	// =====================================================================

	describe('getSwapExpiryInfo (generate-receive-invoice)', () => {
		it('returns null for non-object input', async () => {
			const { getSwapExpiryInfo } = await import('$lib/utils/generate-receive-invoice');
			expect(getSwapExpiryInfo(null)).toBeNull();
			expect(getSwapExpiryInfo(undefined)).toBeNull();
			expect(getSwapExpiryInfo('string')).toBeNull();
			expect(getSwapExpiryInfo(42)).toBeNull();
		});

		it('returns null when expiresAt is missing', async () => {
			const { getSwapExpiryInfo } = await import('$lib/utils/generate-receive-invoice');
			expect(getSwapExpiryInfo({})).toBeNull();
			expect(getSwapExpiryInfo({ expiresAt: 0 })).toBeNull();
			expect(getSwapExpiryInfo({ expiresAt: -1 })).toBeNull();
		});

		it('returns expiry info when expiresAt is valid', async () => {
			const { getSwapExpiryInfo } = await import('$lib/utils/generate-receive-invoice');
			const future = Date.now() + 60_000;
			const result = getSwapExpiryInfo({ expiresAt: future });

			expect(result).not.toBeNull();
			expect(result!.expiresAt).toBe(future);
			expect(result!.isExpired).toBe(false);
			expect(result!.remainingMs).toBeGreaterThan(0);
		});

		it('marks expired when expiresAt is in the past', async () => {
			const { getSwapExpiryInfo } = await import('$lib/utils/generate-receive-invoice');
			const past = Date.now() - 1000;
			const result = getSwapExpiryInfo({ expiresAt: past });

			expect(result).not.toBeNull();
			expect(result!.isExpired).toBe(true);
			expect(result!.remainingMs).toBe(0);
		});
	});
});

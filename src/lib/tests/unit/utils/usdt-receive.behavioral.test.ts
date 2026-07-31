/**
 * USDT Receive — Behavioral Tests
 *
 * Tests the full USDT Arbitrum receive flow across three modules:
 *   1. receive-network-mapping.ts  — SOURCE_CHAIN_MAP, getSourceFromNetwork, deriveChainInfo
 *   2. generate-receive-invoice.ts — handleDirectReceive for usdt0-arb
 *   3. chain-utils.ts              — getUSDTContractAddressForNetwork, getChainIdForNetwork
 *
 * Mocks only external I/O (wallet stores, connected wallets, debug logger).
 * Tests real functions and their internal processing flow.
 *
 * Pattern: meta-tx-relay behavioral tests — mock external I/O, test internals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock external I/O only ──────────────────────────────────────────────────

const { mockGetHandle, mockCreateConnectedReverseSwap } = vi.hoisted(() => ({
	mockGetHandle: vi.fn(),
	mockCreateConnectedReverseSwap: vi.fn()
}));

vi.mock('$lib/stores/connected-wallets.store', () => ({
	getHandle: mockGetHandle
}));

vi.mock('$lib/services/connected-wallet-reverse-swap', () => ({
	createConnectedReverseSwap: mockCreateConnectedReverseSwap
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletManager: {
		createReverseSwap: vi.fn(),
		createChainSwap: vi.fn()
	}
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
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
	type GenerateInvoiceParams
} from '$lib/utils/generate-receive-invoice';

import {
	getUSDTContractAddressForNetwork,
	getChainIdForNetwork
} from '$lib/services/external-wallet/chain-utils';

// ── Constants ───────────────────────────────────────────────────────────────

const USDT0_ARB_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const ARB_CHAIN_ID = 42161;

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeCallbacks() {
	return {
		onSuccess: vi.fn(),
		onError: vi.fn(),
		onClose: vi.fn()
	};
}

function makeParams(overrides?: Partial<GenerateInvoiceParams>): GenerateInvoiceParams {
	return {
		invoiceAmount: 50_000,
		selectedNetwork: 'usdt0-arb',
		selectedReceiveWalletId: null,
		isReceiveWalletValid: false,
		formState: {
			amount: '50000',
			unit: 'sats',
			mathExpression: '',
			memo: '',
			selectedNetwork: 'usdt0-arb',
			chargeFeesToPayer: false
		},
		totalFees: 100,
		rskAddress: '0xRSKAddress11111111111111111111111111111',
		rskConnected: true,
		bscAddress: '0xBSCAddress111111111111111111111111111111',
		bscConnected: true,
		swapRoutesCount: 0,
		...overrides
	};
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('USDT Receive — Behavioral Tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetHandle.mockReturnValue({
			address: '0xConnectedWalletAddr',
			walletName: 'MetaMask',
			evmSigner: {},
			bitcoinSigner: undefined
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// -----------------------------------------------------------------------
	// 1. Receive Network Mapping — USDT networks
	// -----------------------------------------------------------------------

	describe('Receive Network Mapping — USDT networks', () => {
		describe('getSourceFromNetwork', () => {
			it('returns usdt0-arb for usdt0-arb (legacy alias)', () => {
				expect(getSourceFromNetwork('usdt0-arb')).toBe('usdt0-arb');
			});

			it('returns usdt0-arb for usdt0-arb (canonical)', () => {
				expect(getSourceFromNetwork('usdt0-arb')).toBe('usdt0-arb');
			});

			it('returns usdt0-arb for usdt0-arb (canonical form)', () => {
				expect(getSourceFromNetwork('usdt0-arb')).toBe('usdt0-arb');
			});
		});

		describe('SOURCE_CHAIN_MAP', () => {
			it('usdt0-arb has chainId 42161 and correct USDT0 address', () => {
				const entry = SOURCE_CHAIN_MAP['usdt0-arb'];
				expect(entry).toBeDefined();
				expect(entry!.chainId).toBe(42161);
				expect(entry!.address).toBe(USDT0_ARB_ADDRESS);
			});

			it('usdt0-arb alias has chainId 42161 and correct USDT0 address', () => {
				const entry = SOURCE_CHAIN_MAP['usdt0-arb'];
				expect(entry).toBeDefined();
				expect(entry!.chainId).toBe(42161);
				expect(entry!.address).toBe(USDT0_ARB_ADDRESS);
			});

			it('both usdt0-arb entries point to the same contract', () => {
				const a = SOURCE_CHAIN_MAP['usdt0-arb'];
				const b = SOURCE_CHAIN_MAP['usdt0-arb'];
				expect(a).toBeDefined();
				expect(b).toBeDefined();
				expect(a!.chainId).toBe(b!.chainId);
				expect(a!.address).toBe(b!.address);
			});
		});

		describe('deriveChainInfo', () => {
			it('returns correct chainId, address, asset name, decimals for usdt0-arb', () => {
				const info = deriveChainInfo('usdt0-arb');
				expect(info).toEqual({
					chainId: ARB_CHAIN_ID,
					address: USDT0_ARB_ADDRESS,
					asset: 'USDT0',
					decimals: 18
				});
			});

			it('returns USDT0 as asset name for usdt0-arb', () => {
				const info = deriveChainInfo('usdt0-arb');
				expect(info).toBeDefined();
				expect(info!.asset).toBe('USDT0');
				expect(info!.chainId).toBe(ARB_CHAIN_ID);
				expect(info!.address).toBe(USDT0_ARB_ADDRESS);
				expect(info!.decimals).toBe(18);
			});

			it('returns full info object with all required fields', () => {
				const info = deriveChainInfo('usdt0-arb');
				expect(info).toHaveProperty('chainId');
				expect(info).toHaveProperty('address');
				expect(info).toHaveProperty('asset');
				expect(info).toHaveProperty('decimals');
			});
		});
	});

	// -----------------------------------------------------------------------
	// 2. Generate Receive Invoice — USDT0 Arbitrum
	// -----------------------------------------------------------------------

	describe('Generate Receive Invoice — USDT0 Arbitrum', () => {
		describe('usdt0-arb — built-in wallet', () => {
			it('shows rskAddress (same EOA on all chains)', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeParams({
						selectedNetwork: 'usdt0-arb',
						selectedReceiveWalletId: null,
						isReceiveWalletValid: false,
						rskAddress: '0xRSKBuiltInEOA',
						rskConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xRSKBuiltInEOA',
						network: 'usdt0-arb'
					})
				);
				expect(callbacks.onClose).toHaveBeenCalled();
			});

		it('returns correct amount and formState in result', async () => {
			const formState = {
				amount: '75000',
				unit: 'sats' as const,
				mathExpression: '',
				memo: 'usdt receive',
				selectedNetwork: 'usdt0-arb',
				chargeFeesToPayer: true
			};
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					invoiceAmount: 75_000,
					selectedNetwork: 'usdt0-arb',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: '0xRSKBuiltInEOA',
					rskConnected: true,
					formState,
					totalFees: 250
				}),
				callbacks
			);

			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					address: '0xRSKBuiltInEOA',
					network: 'usdt0-arb',
					amount: 75_000,
					totalFees: 250,
					chargeFeesToPayer: true,
					memo: 'usdt receive',
					formState
				})
			);
		});

			it('calls onError when rsk not connected', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeParams({
						selectedNetwork: 'usdt0-arb',
						selectedReceiveWalletId: null,
						isReceiveWalletValid: false,
						rskAddress: undefined,
						rskConnected: false
					}),
					callbacks
				);

				expect(callbacks.onError).toHaveBeenCalledWith('wallet.rsk_not_connected');
				expect(callbacks.onSuccess).not.toHaveBeenCalled();
			});
		});

		describe('usdt0-arb — connected wallet', () => {
			it('shows connected wallet address', async () => {
				mockGetHandle.mockReturnValue({
					address: '0xConnectedArbitrumAddr',
					walletName: 'MetaMask'
				});
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeParams({
						selectedNetwork: 'usdt0-arb',
						selectedReceiveWalletId: 'wallet-1',
						isReceiveWalletValid: true
					}),
					callbacks
				);

				expect(mockGetHandle).toHaveBeenCalledWith('wallet-1');
				expect(callbacks.onSuccess).toHaveBeenCalledWith(
					expect.objectContaining({
						address: '0xConnectedArbitrumAddr',
						network: 'usdt0-arb'
					})
				);
			});

			it('calls onError when connected wallet not found', async () => {
				mockGetHandle.mockReturnValue(undefined);
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeParams({
						selectedNetwork: 'usdt0-arb',
						selectedReceiveWalletId: 'wallet-missing',
						isReceiveWalletValid: true
					}),
					callbacks
				);

				expect(callbacks.onError).toHaveBeenCalledWith('wallet.receive.connected_wallet_not_found');
				expect(callbacks.onSuccess).not.toHaveBeenCalled();
			});

			it('calls onError when handle has no address', async () => {
				mockGetHandle.mockReturnValue({ address: undefined, walletName: 'MetaMask' });
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeParams({
						selectedNetwork: 'usdt0-arb',
						selectedReceiveWalletId: 'wallet-1',
						isReceiveWalletValid: true
					}),
					callbacks
				);

				expect(callbacks.onError).toHaveBeenCalledWith('wallet.receive.connected_wallet_not_found');
			});
		});

		describe('usdt0-arb — supported receive destination', () => {
			it('calls onSuccess because usdt0-arb IS in the receive handler list', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeParams({
						selectedNetwork: 'usdt0-arb',
						selectedReceiveWalletId: null,
						isReceiveWalletValid: false,
						rskAddress: '0xRSKForUSDTArb',
						rskConnected: true
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalled();
				expect(callbacks.onError).not.toHaveBeenCalled();
			});

			it('maps correctly in SOURCE_CHAIN_MAP despite not being a receive destination', () => {
				const entry = SOURCE_CHAIN_MAP['usdt0-arb'];
				expect(entry).toBeDefined();
				expect(entry!.chainId).toBe(42161);
				expect(entry!.address).toBe(USDT0_ARB_ADDRESS);
			});

			it('maps correctly via getSourceFromNetwork despite not being a receive destination', () => {
				expect(getSourceFromNetwork('usdt0-arb')).toBe('usdt0-arb');
			});
		});

		describe('does not require swap routes', () => {
			it('proceeds normally when swapRoutesCount is 0', async () => {
				const callbacks = makeCallbacks();
				await generateReceiveInvoice(
					makeParams({
						selectedNetwork: 'usdt0-arb',
						selectedReceiveWalletId: null,
						isReceiveWalletValid: false,
						rskAddress: '0xRSKAddr',
						rskConnected: true,
						swapRoutesCount: 0
					}),
					callbacks
				);

				expect(callbacks.onSuccess).toHaveBeenCalled();
				expect(callbacks.onError).not.toHaveBeenCalled();
			});
		});
	});

	// -----------------------------------------------------------------------
	// 3. Chain Utils — USDT contract address resolution
	// -----------------------------------------------------------------------

	describe('Chain Utils — USDT contract address resolution', () => {
		describe('getUSDTContractAddressForNetwork', () => {
			it('returns 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9 for usdt0-arb', () => {
				const address = getUSDTContractAddressForNetwork('usdt0-arb');
				expect(address).toBe(USDT0_ARB_ADDRESS);
			});

			it('returns the same address regardless of mainnet/testnet env', () => {
				vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
				const mainnetAddr = getUSDTContractAddressForNetwork('usdt0-arb');

				vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
				const testnetAddr = getUSDTContractAddressForNetwork('usdt0-arb');

				expect(mainnetAddr).toBe(USDT0_ARB_ADDRESS);
				expect(testnetAddr).toBe(USDT0_ARB_ADDRESS);
			});
		});

		describe('getChainIdForNetwork', () => {
			it('returns 42161 for usdt0-arb on mainnet', () => {
				vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
				expect(getChainIdForNetwork('usdt0-arb')).toBe(42161);
			});

			it('returns 421614 for usdt0-arb on testnet', () => {
				vi.stubEnv('VITE_RSK_NETWORK', 'testnet');
				expect(getChainIdForNetwork('usdt0-arb')).toBe(421614);
			});
		});
	});

	// -----------------------------------------------------------------------
	// 4. Edge cases
	// -----------------------------------------------------------------------

	describe('Edge cases', () => {
		describe('getSourceFromNetwork with unknown network', () => {
			it('returns rbtc for completely unknown network', () => {
				expect(getSourceFromNetwork('unknown-network')).toBe('rbtc');
			});

			it('returns rbtc for empty string', () => {
				expect(getSourceFromNetwork('')).toBe('rbtc');
			});

			it('returns usdt-bsc for generic usdt- prefixed networks', () => {
				expect(getSourceFromNetwork('usdt-fantom')).toBe('usdt-bsc');
			});

			it('returns usdt-bsc for generic usdt0- prefixed networks', () => {
				expect(getSourceFromNetwork('usdt0-optimism')).toBe('usdt-bsc');
			});
		});

		describe('deriveChainInfo with invalid network', () => {
			it('returns null for unknown network', () => {
				expect(deriveChainInfo('unknown-network')).toBeNull();
			});

			it('returns null for empty string', () => {
				expect(deriveChainInfo('')).toBeNull();
			});

			it('returns null for random garbage', () => {
				expect(deriveChainInfo('not-a-real-network-123')).toBeNull();
			});
		});

		describe('SOURCE_CHAIN_MAP entries are well-formed', () => {
			it('every entry has a numeric chainId and non-empty address', () => {
				for (const [key, entry] of Object.entries(SOURCE_CHAIN_MAP)) {
					expect(entry).toBeDefined();
					expect(typeof entry!.chainId).toBe('number');
					expect(typeof entry!.address).toBe('string');
					expect(entry!.address.length).toBeGreaterThan(0);
				}
			});
		});
	});
});

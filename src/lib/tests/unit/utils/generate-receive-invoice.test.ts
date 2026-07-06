/**
 * Unit tests for generate-receive-invoice.ts
 *
 * Tests the invoice/swap generation service for all network types:
 *   - Lightning (builtin + connected wallet)
 *   - Rootstock (builtin + connected wallet)
 *   - Bitcoin (builtin + connected wallet)
 *   - Error paths: unknown network, no routes, missing wallet
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
	mockCreateReverseSwap,
	mockCreateChainSwap,
	mockGetHandle,
	mockCreateConnectedReverseSwap
} = vi.hoisted(() => {
	return {
		mockCreateReverseSwap: vi.fn(),
		mockCreateChainSwap: vi.fn(),
		mockGetHandle: vi.fn(),
		mockCreateConnectedReverseSwap: vi.fn()
	};
});

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

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

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn()
	})
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
	generateReceiveInvoice,
	type GenerateInvoiceParams
} from '$lib/utils/generate-receive-invoice';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
		selectedNetwork: 'lightning-bitcoin',
		selectedReceiveWalletId: null,
		isReceiveWalletValid: false,
		formState: {
			amount: '50000',
			unit: 'sats',
			mathExpression: '',
			memo: 'test memo',
			selectedNetwork: 'lightning-bitcoin',
			chargeFeesToPayer: false
		},
		totalFees: 100,
		rskAddress: '0xRSKAddress11111111111111111111111111111',
		rskConnected: true,
		bscAddress: '0xBSCAddress111111111111111111111111111111',
		bscConnected: true,
		swapRoutesCount: 2,
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateReceiveInvoice', () => {
	beforeEach(() => {
		vi.clearAllMocks();
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

	// -------------------------------------------------------------------
	// Lightning
	// -------------------------------------------------------------------

	describe('Lightning — built-in wallet', () => {
		it('creates reverse swap via walletManager and returns swapId', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'lightning-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false
				}),
				callbacks
			);

			expect(mockCreateReverseSwap).toHaveBeenCalledWith(50_000);
			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					swapId: 'builtin-swap-123',
					amount: 50_000
				})
			);
			expect(callbacks.onClose).toHaveBeenCalled();
		});

		it('floors the invoice amount', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					invoiceAmount: 50_999.7,
					selectedNetwork: 'lightning-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false
				}),
				callbacks
			);

			expect(mockCreateReverseSwap).toHaveBeenCalledWith(50_999);
			expect(callbacks.onSuccess).toHaveBeenCalledWith(expect.objectContaining({ amount: 50_999 }));
		});
	});

	describe('Lightning — connected wallet', () => {
		it('uses createConnectedReverseSwap with handle address', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'lightning-bitcoin',
					selectedReceiveWalletId: 'wallet-1',
					isReceiveWalletValid: true
				}),
				callbacks
			);

			expect(mockGetHandle).toHaveBeenCalledWith('wallet-1');
			expect(mockCreateConnectedReverseSwap).toHaveBeenCalledWith(
				50_000,
				'0xConnectedWalletAddr',
				'wallet-1',
				'MetaMask'
			);
			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					swapId: 'connected-swap-789',
					amount: 50_000
				})
			);
			expect(callbacks.onClose).toHaveBeenCalled();
		});
	});

	describe('Lightning — connected wallet not found', () => {
		it('calls onError when getHandle returns undefined', async () => {
			mockGetHandle.mockReturnValue(undefined);
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'lightning-bitcoin',
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
					selectedNetwork: 'lightning-bitcoin',
					selectedReceiveWalletId: 'wallet-1',
					isReceiveWalletValid: true
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.receive.connected_wallet_not_found');
		});
	});

	// -------------------------------------------------------------------
	// Rootstock
	// -------------------------------------------------------------------

	describe('Rootstock — built-in', () => {
		it('returns rsk address for built-in wallet', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'rootstock-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: '0xRSKBuiltInAddr',
					rskConnected: true
				}),
				callbacks
			);

			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					address: '0xRSKBuiltInAddr',
					network: 'rootstock-bitcoin',
					amount: 50_000
				})
			);
			expect(callbacks.onClose).toHaveBeenCalled();
		});

		it('calls onError when rsk not connected', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'rootstock-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: undefined,
					rskConnected: false
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.rsk_not_connected');
		});
	});

	describe('Rootstock — connected', () => {
		it('uses getHandle to get connected wallet address', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'rootstock-bitcoin',
					selectedReceiveWalletId: 'wallet-1',
					isReceiveWalletValid: true
				}),
				callbacks
			);

			expect(mockGetHandle).toHaveBeenCalledWith('wallet-1');
			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					address: '0xConnectedWalletAddr',
					network: 'rootstock-bitcoin'
				})
			);
		});
	});

	// -------------------------------------------------------------------
	// Bitcoin
	// -------------------------------------------------------------------

	describe('Bitcoin — built-in', () => {
		it('returns rsk address as bitcoin address for built-in wallet', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: '0xRSKForBitcoin',
					rskConnected: true
				}),
				callbacks
			);

			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					address: '0xRSKForBitcoin',
					network: 'bitcoin',
					amount: 50_000
				})
			);
			expect(callbacks.onClose).toHaveBeenCalled();
		});

		it('calls onError when rsk not connected for bitcoin built-in', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: undefined,
					rskConnected: false
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.rsk_not_connected');
		});
	});

	describe('Bitcoin — connected with bitcoin signer', () => {
		it('uses bitcoin signer address from handle', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'bitcoin',
					selectedReceiveWalletId: 'wallet-1',
					isReceiveWalletValid: true
				}),
				callbacks
			);

			expect(mockGetHandle).toHaveBeenCalledWith('wallet-1');
			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					address: 'tb1qConnectedBtc',
					network: 'bitcoin'
				})
			);
		});
	});

	describe('Bitcoin — connected without signer', () => {
		it('calls onError when bitcoin signer is missing', async () => {
			mockGetHandle.mockReturnValue({
				address: '0xConnectedWalletAddr',
				walletName: 'MetaMask',
				evmSigner: {},
				bitcoinSigner: undefined
			});
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'bitcoin',
					selectedReceiveWalletId: 'wallet-1',
					isReceiveWalletValid: true
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.receive.connected_wallet_not_found');
			expect(callbacks.onSuccess).not.toHaveBeenCalled();
		});

		it('calls onError when bitcoin signer has no address', async () => {
			mockGetHandle.mockReturnValue({
				address: '0xConnectedWalletAddr',
				walletName: 'MetaMask',
				evmSigner: {},
				bitcoinSigner: { address: undefined }
			});
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'bitcoin',
					selectedReceiveWalletId: 'wallet-1',
					isReceiveWalletValid: true
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.receive.connected_wallet_not_found');
		});
	});

	// -------------------------------------------------------------------
	// Error paths
	// -------------------------------------------------------------------

	describe('Unknown network', () => {
		it('calls onError for unsupported network', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'unknown-network',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.receive_form.network_not_available');
			expect(callbacks.onSuccess).not.toHaveBeenCalled();
		});
	});

	describe('No routes for swap network', () => {
		it('calls onError when swapRoutesCount is 0 for lightning', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'lightning-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					swapRoutesCount: 0
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.swap.error.no_routes');
			expect(callbacks.onSuccess).not.toHaveBeenCalled();
		});

		it('calls onError when swapRoutesCount is 0 for bitcoin', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					swapRoutesCount: 0
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.swap.error.no_routes');
		});

		it('calls onError when swapRoutesCount is 0 for liquid-bitcoin', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'liquid-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					swapRoutesCount: 0
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.swap.error.no_routes');
		});

		it('does not check routes for non-swap networks (rootstock)', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'rootstock-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: '0xRSKAddr',
					rskConnected: true,
					swapRoutesCount: 0
				}),
				callbacks
			);

			// rootstock is not in swapNetworks list, so it proceeds normally
			expect(callbacks.onSuccess).toHaveBeenCalled();
			expect(callbacks.onError).not.toHaveBeenCalled();
		});
	});

	// -------------------------------------------------------------------
	// Additional edge cases
	// -------------------------------------------------------------------

	describe('Callbacks and error propagation', () => {
		it('calls onClose after onSuccess for direct receive', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'rootstock-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: '0xRSKAddr',
					rskConnected: true
				}),
				callbacks
			);

			// onClose is called after the network handler returns
			expect(callbacks.onClose).toHaveBeenCalled();
		});

		it('forwards formState in the result', async () => {
			const formState = {
				amount: '100000',
				unit: 'sats' as const,
				mathExpression: '50000+50000',
				memo: 'my memo',
				selectedNetwork: 'rootstock-bitcoin',
				chargeFeesToPayer: true
			};
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'rootstock-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: '0xRSKAddr',
					rskConnected: true,
					formState,
					totalFees: 250
				}),
				callbacks
			);

			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					formState,
					totalFees: 250,
					chargeFeesToPayer: true,
					memo: 'my memo'
				})
			);
		});

		it('catches errors from createReverseSwap and calls onError', async () => {
			mockCreateReverseSwap.mockRejectedValue(new Error('Boltz API unavailable'));
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'lightning-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('Boltz API unavailable');
			expect(callbacks.onSuccess).not.toHaveBeenCalled();
		});

		it('catches non-Error exceptions and returns generic message', async () => {
			mockCreateReverseSwap.mockRejectedValue('string error');
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'lightning-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.invoice.generation_failed');
		});

		it('catches errors from createConnectedReverseSwap and calls onError', async () => {
			mockCreateConnectedReverseSwap.mockRejectedValue(new Error('Swap creation failed'));
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'lightning-bitcoin',
					selectedReceiveWalletId: 'wallet-1',
					isReceiveWalletValid: true
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('Swap creation failed');
		});
	});

	describe('USDT BSC — connected', () => {
		it('uses getHandle address for usdt-bsc connected wallet', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'usdt-bsc',
					selectedReceiveWalletId: 'wallet-1',
					isReceiveWalletValid: true
				}),
				callbacks
			);

			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					address: '0xConnectedWalletAddr',
					network: 'usdt-bsc'
				})
			);
		});
	});

	describe('USDT BSC — built-in', () => {
		it('returns bsc address for built-in wallet', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'usdt-bsc',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					bscAddress: '0xBSCBuiltInAddr',
					bscConnected: true
				}),
				callbacks
			);

			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					address: '0xBSCBuiltInAddr',
					network: 'usdt-bsc'
				})
			);
		});

		it('calls onError when bsc not connected', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'usdt-bsc',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					bscAddress: undefined,
					bscConnected: false
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.bsc.not_connected');
		});
	});

	describe('Liquid — connected wallet not supported', () => {
		it('calls onError when connected wallet used with liquid', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'liquid-bitcoin',
					selectedReceiveWalletId: 'wallet-1',
					isReceiveWalletValid: true,
					swapRoutesCount: 1
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith(
				'wallet.receive.liquid_not_available_connected'
			);
		});
	});

	describe('Liquid — built-in', () => {
		it('creates chain swap for built-in liquid receive', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'liquid-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: '0xRSKAddr',
					rskConnected: true,
					swapRoutesCount: 1
				}),
				callbacks
			);

			expect(mockCreateChainSwap).toHaveBeenCalledWith(50_000);
			expect(callbacks.onSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					swapId: 'chain-swap-456',
					amount: 50_000
				})
			);
		});

		it('calls onError when rsk not connected for liquid built-in', async () => {
			const callbacks = makeCallbacks();
			await generateReceiveInvoice(
				makeParams({
					selectedNetwork: 'liquid-bitcoin',
					selectedReceiveWalletId: null,
					isReceiveWalletValid: false,
					rskAddress: undefined,
					rskConnected: false,
					swapRoutesCount: 1
				}),
				callbacks
			);

			expect(callbacks.onError).toHaveBeenCalledWith('wallet.rsk_not_connected');
		});
	});
});

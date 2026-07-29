/**
 * Wallet Send — Unit Tests
 *
 * Tests for wallet-send.ts: sendRBTC, sendRawTransaction, sendArbitrumTransaction,
 * sendRSKToken, estimateERC20Gas, and related functions.
 *
 * All external dependencies are mocked — no real network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writable } from 'svelte/store';

// ---------------------------------------------------------------------------
// Hoisted mutable mocks — shared between vi.mock factories and test assertions
// ---------------------------------------------------------------------------

const {
	mockLoadAssets,
	mockLoadTransactions,
	mockClearBalanceCache,
	mockRskWalletSend,
	mockRskWalletGetWallet,
	mockRskWalletGetProvider,
	mockBscWalletGetWallet,
	mockRskWalletEstimateGas,
	mockBscWalletSendUSDT,
	mockBscWalletSendBNB,
	mockContractFactory
} = vi.hoisted(() => {
	return {
		mockLoadAssets: vi.fn().mockResolvedValue(undefined),
		mockLoadTransactions: vi.fn().mockResolvedValue(undefined),
		mockClearBalanceCache: vi.fn(),
		mockRskWalletSend: vi.fn(),
		mockRskWalletGetWallet: vi.fn(),
		mockRskWalletGetProvider: vi.fn(),
		mockBscWalletGetWallet: vi.fn(),
		mockRskWalletEstimateGas: vi.fn(),
		mockBscWalletSendUSDT: vi.fn(),
		mockBscWalletSendBNB: vi.fn(),
		mockContractFactory: vi.fn().mockImplementation(function () {
			return {
				transfer: vi.fn().mockResolvedValue({
					hash: '0xtxhash',
					wait: vi.fn().mockResolvedValue({ hash: '0xtxhash', status: 1 })
				}),
				estimateGas: { transfer: vi.fn().mockResolvedValue(21000n) },
				interface: { encodeFunctionData: vi.fn().mockReturnValue('0xdata') }
			};
		})
	};
});

// ---------------------------------------------------------------------------
// Mock wallet state store
// ---------------------------------------------------------------------------

const mockWalletStoreValue = {
	rsk: {
		address: '0xabc123',
		wallet: null as unknown,
		provider: null as unknown,
		balance: '0',
		formattedBalance: '0.00',
		connected: true,
		connecting: false,
		error: null,
		blockNumber: null
	},
	bsc: { address: '0xdef456' },
	arb: { address: '0x789abc' }
};

const mockWalletStore = writable(mockWalletStoreValue);

// ---------------------------------------------------------------------------
// Mock wallet manager
// ---------------------------------------------------------------------------

const mockWalletManager = {
	rskWallet: {
		send: mockRskWalletSend,
		getWallet: mockRskWalletGetWallet,
		getProvider: mockRskWalletGetProvider,
		estimateGas: mockRskWalletEstimateGas
	},
	bscWallet: {
		getWallet: mockBscWalletGetWallet,
		sendUSDT: mockBscWalletSendUSDT,
		sendBNB: mockBscWalletSendBNB
	}
};

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/stores/wallet/wallet-state', () => ({
	walletStore: mockWalletStore,
	getWalletManager: vi.fn(() => mockWalletManager),
	state: { sdkWalletManager: null }
}));

vi.mock('$lib/stores/wallet/wallet-balances', () => ({
	loadAssets: mockLoadAssets
}));

vi.mock('$lib/stores/wallet/wallet-transactions', () => ({
	loadTransactions: mockLoadTransactions
}));

vi.mock('$lib/api/services/token-balance.service', () => ({
	default: { clearBalanceCache: mockClearBalanceCache }
}));

vi.mock('$lib/wallet/gasless-store', () => ({
	sendGaslessCalls: vi.fn(),
	estimateFee: vi.fn().mockResolvedValue({
		feeBuffer: '1000000000000000',
		feeCostUSD: 0.03,
		feeTier: 'Medium',
		totalWithBuffer: '1000000000000001',
		estimatedGas: {
			callGasLimit: '200000',
			verificationGasLimit: '100000',
			preVerificationGas: '50000'
		}
	}),
	walletReady: writable(false)
}));

vi.mock('$lib/wallet/gasless.config', () => ({
	USDT0_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
	FEE_BUFFER_MIN: { '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 10_000_000_000_000_000n }
}));

// ---------------------------------------------------------------------------
// Mock ethers — replaces Contract constructor with a hoisted mock factory
// so tests can configure per-test contract instances without mutating the
// frozen ES module namespace.
// ---------------------------------------------------------------------------

vi.mock('ethers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('ethers')>();
	// Mock JsonRpcProvider as a class-like constructor
	class MockJsonRpcProvider {
		getBalance = vi.fn().mockResolvedValue(1_000_000_000_000_000_000n); // 1 ETH
	}
	return {
		...actual,
		Contract: mockContractFactory,
		// Passthrough getAddress so tests can use non-checksummed addresses
		getAddress: vi.fn((addr: string) => addr),
		JsonRpcProvider: MockJsonRpcProvider,
		ethers: {
			...actual.ethers,
			Contract: mockContractFactory,
			getAddress: vi.fn((addr: string) => addr),
			JsonRpcProvider: MockJsonRpcProvider
		}
	};
});

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();

	// Default: RSK wallet send succeeds
	mockRskWalletSend.mockResolvedValue('0xtxhash-rbtc-123');

	// Default: getWallet returns a mock ethers Wallet
	const mockSendTransaction = vi.fn().mockResolvedValue({
		hash: '0xtxhash-raw-456',
		wait: vi.fn().mockResolvedValue({ hash: '0xtxhash-raw-456' })
	});
	const mockWallet = {
		address: '0xabc123',
		sendTransaction: mockSendTransaction,
		connect: vi.fn().mockReturnThis()
	};
	mockRskWalletGetWallet.mockReturnValue(mockWallet);
	mockRskWalletGetProvider.mockReturnValue({});

	// Default: BSC wallet
	mockBscWalletGetWallet.mockReturnValue({
		sendTransaction: vi.fn().mockResolvedValue({
			hash: '0xtxhash-bsc-789',
			wait: vi.fn().mockResolvedValue({ hash: '0xtxhash-bsc-789' })
		})
	});

	// Default: BSC send functions
	mockBscWalletSendUSDT.mockResolvedValue('0xtxhash-bsc-usdt');
	mockBscWalletSendBNB.mockResolvedValue('0xtxhash-bsc-bnb');

	// Default: estimateGas
	mockRskWalletEstimateGas.mockResolvedValue({
		gasLimit: '21000',
		gasPrice: '60000000',
		totalCost: '1260000000000000',
		totalCostFormatted: '0.00126'
	});

	// Default: wallet store value
	mockWalletStoreValue.rsk.address = '0xabc123';
	mockWalletStoreValue.rsk.wallet = null;
	mockWalletStoreValue.rsk.provider = null;
});

// ===========================================================================
// Tests
// ===========================================================================

describe('wallet-send', () => {
	// =========================================================================
	// sendRBTC
	// =========================================================================

	describe('sendRBTC(to, amount)', () => {
		it('returns tx hash on success', async () => {
			const { sendRBTC } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendRBTC('0xrecipient', '0.5');

			expect(txHash).toBe('0xtxhash-rbtc-123');
			expect(mockRskWalletSend).toHaveBeenCalledWith('0xrecipient', '0.5');
		});

		it('calls loadAssets and loadTransactions after success', async () => {
			const { sendRBTC } = await import('$lib/stores/wallet/wallet-send');

			await sendRBTC('0xrecipient', '0.5');

			// loadAssets and loadTransactions are fire-and-forget via Promise.allSettled,
			// so we need to wait a tick for them to be called
			await vi.waitFor(() => {
				expect(mockLoadAssets).toHaveBeenCalled();
				expect(mockLoadTransactions).toHaveBeenCalled();
			});
		});

		it('propagates manager error', async () => {
			mockRskWalletSend.mockRejectedValueOnce(new Error('Insufficient funds'));

			const { sendRBTC } = await import('$lib/stores/wallet/wallet-send');

			await expect(sendRBTC('0xrecipient', '100')).rejects.toThrow('Insufficient funds');
		});

		it('propagates error when wallet manager is not initialized', async () => {
			const { getWalletManager } = await import('$lib/stores/wallet/wallet-state');
			vi.mocked(getWalletManager).mockImplementationOnce(() => {
				throw new Error('Wallet is not initialized.');
			});

			const { sendRBTC } = await import('$lib/stores/wallet/wallet-send');

			await expect(sendRBTC('0xrecipient', '0.5')).rejects.toThrow('Wallet is not initialized.');
		});
	});

	// =========================================================================
	// sendRawTransaction
	// =========================================================================

	describe('sendRawTransaction(to, value, data, chainType)', () => {
		it('sends via RSK wallet by default', async () => {
			const { sendRawTransaction } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendRawTransaction({
				to: '0xcontract',
				data: '0xcalldata',
				value: '1000000000000000000'
			});

			expect(txHash).toBe('0xtxhash-raw-456');
			// Should have called getWallet (RSK by default)
			expect(mockRskWalletGetWallet).toHaveBeenCalled();
		});

		it('sends via RSK wallet when chain is "rsk"', async () => {
			const { sendRawTransaction } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendRawTransaction({
				to: '0xcontract',
				data: '0xcalldata',
				value: '1000000000000000000',
				chain: 'rsk'
			});

			expect(txHash).toBe('0xtxhash-raw-456');
			expect(mockRskWalletGetWallet).toHaveBeenCalled();
		});

		it('sends via BSC wallet when chain is "bsc"', async () => {
			const { sendRawTransaction } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendRawTransaction({
				to: '0xcontract',
				data: '0xcalldata',
				value: '1000000000000000000',
				chain: 'bsc'
			});

			expect(txHash).toBe('0xtxhash-bsc-789');
			expect(mockBscWalletGetWallet).toHaveBeenCalled();
		});

		it('passes gasLimit when provided', async () => {
			const mockSendTx = vi.fn().mockResolvedValue({
				hash: '0xtxhash-gaslimit',
				wait: vi.fn().mockResolvedValue({ hash: '0xtxhash-gaslimit' })
			});
			mockRskWalletGetWallet.mockReturnValue({
				sendTransaction: mockSendTx,
				connect: vi.fn().mockReturnThis()
			});

			const { sendRawTransaction } = await import('$lib/stores/wallet/wallet-send');

			await sendRawTransaction({
				to: '0xcontract',
				data: '0xcalldata',
				value: '0',
				gasLimit: 300000
			});

			expect(mockSendTx).toHaveBeenCalledWith(expect.objectContaining({ gasLimit: 300000 }));
		});

		it('omits gasLimit when not provided', async () => {
			const mockSendTx = vi.fn().mockResolvedValue({
				hash: '0xtxhash-nogaslimit',
				wait: vi.fn().mockResolvedValue({ hash: '0xtxhash-nogaslimit' })
			});
			mockRskWalletGetWallet.mockReturnValue({
				sendTransaction: mockSendTx,
				connect: vi.fn().mockReturnThis()
			});

			const { sendRawTransaction } = await import('$lib/stores/wallet/wallet-send');

			await sendRawTransaction({
				to: '0xcontract',
				data: '0xcalldata',
				value: '0'
			});

			const callArgs = mockSendTx.mock.calls[0][0];
			expect(callArgs).not.toHaveProperty('gasLimit');
		});

		it('propagates wallet send error', async () => {
			const mockSendTx = vi.fn().mockRejectedValue(new Error('nonce too low'));
			mockRskWalletGetWallet.mockReturnValue({
				sendTransaction: mockSendTx,
				connect: vi.fn().mockReturnThis()
			});

			const { sendRawTransaction } = await import('$lib/stores/wallet/wallet-send');

			await expect(
				sendRawTransaction({
					to: '0xcontract',
					data: '0xcalldata',
					value: '0'
				})
			).rejects.toThrow('nonce too low');
		});
	});

	// =========================================================================
	// sendArbitrumTransaction
	// =========================================================================

	describe('sendArbitrumTransaction(to, value, data)', () => {
		it('falls back to direct tx and returns tx hash on success', async () => {
			// By default, walletReady store is false, so gasless path is skipped
			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendArbitrumTransaction({
				to: '0xarbContract',
				data: '0xarbcalldata',
				value: '500000000000000000'
			});

			// Should use the direct path (RSK wallet connected to Arb provider)
			expect(txHash).toBe('0xtxhash-raw-456');
			expect(mockRskWalletGetWallet).toHaveBeenCalled();
		});

		it('uses direct path when gasless relay is not available (walletReady=false)', async () => {
			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendArbitrumTransaction({
				to: '0xarbContract',
				data: '0xarbcalldata',
				value: '1000000000000000'
			});

			expect(txHash).toBeDefined();
			expect(mockRskWalletGetWallet).toHaveBeenCalled();
		});

		it('propagates direct tx error when both gasless and direct fail', async () => {
			const mockSendTx = vi.fn().mockRejectedValue(new Error('Arb RPC error'));
			mockRskWalletGetWallet.mockReturnValue({
				sendTransaction: mockSendTx,
				connect: vi.fn().mockReturnThis()
			});

			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			await expect(
				sendArbitrumTransaction({
					to: '0xarbContract',
					data: '0xarbcalldata',
					value: '0'
				})
			).rejects.toThrow('Arb RPC error');
		});
	});

	// =========================================================================
	// sendRSKToken
	// =========================================================================

	describe('sendRSKToken(tokenAddress, to, amount)', () => {
		it('sends ERC-20 token and returns receipt hash', async () => {
			const mockReceipt = { hash: '0xtoken-tx-hash' };
			const mockTx = { wait: vi.fn().mockResolvedValue(mockReceipt) };
			const mockTransfer = vi.fn().mockResolvedValue(mockTx);
			const mockDecimals = vi.fn().mockResolvedValue(18);
			const mockContractInstance = {
				transfer: mockTransfer,
				decimals: mockDecimals
			};

			// Configure the hoisted ethers.Contract mock for this test
			mockContractFactory.mockImplementation(function () {
				return mockContractInstance;
			});

			mockRskWalletGetWallet.mockReturnValue({
				address: '0xabc123'
			});
			mockRskWalletGetProvider.mockReturnValue({});

			const { sendRSKToken } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendRSKToken('0xTokenAddress', '0xRecipient', '100');

			expect(txHash).toBe('0xtoken-tx-hash');
			expect(mockDecimals).toHaveBeenCalled();
			expect(mockTransfer).toHaveBeenCalled();
			expect(mockLoadAssets).toHaveBeenCalled();
			expect(mockClearBalanceCache).toHaveBeenCalledWith('0xabc123');
		});

		it('throws when wallet is not initialized (no wallet)', async () => {
			mockRskWalletGetWallet.mockReturnValue(null);
			mockRskWalletGetProvider.mockReturnValue({});

			const { sendRSKToken } = await import('$lib/stores/wallet/wallet-send');

			await expect(sendRSKToken('0xTokenAddress', '0xRecipient', '100')).rejects.toThrow(
				'RSK wallet not initialized'
			);
		});

		it('throws when provider is not initialized', async () => {
			mockRskWalletGetWallet.mockReturnValue({ address: '0xabc' });
			mockRskWalletGetProvider.mockReturnValue(null);

			const { sendRSKToken } = await import('$lib/stores/wallet/wallet-send');

			await expect(sendRSKToken('0xTokenAddress', '0xRecipient', '100')).rejects.toThrow(
				'RSK wallet not initialized'
			);
		});

		it('throws when receipt is null', async () => {
			const mockTx = { wait: vi.fn().mockResolvedValue(null) };
			const mockTransfer = vi.fn().mockResolvedValue(mockTx);
			const mockDecimals = vi.fn().mockResolvedValue(18);
			const mockContractInstance = {
				transfer: mockTransfer,
				decimals: mockDecimals
			};

			mockContractFactory.mockImplementation(function () {
				return mockContractInstance;
			});

			mockRskWalletGetWallet.mockReturnValue({ address: '0xabc123' });
			mockRskWalletGetProvider.mockReturnValue({});

			const { sendRSKToken } = await import('$lib/stores/wallet/wallet-send');

			await expect(sendRSKToken('0xTokenAddress', '0xRecipient', '100')).rejects.toThrow(
				'Transaction receipt is null'
			);
		});
	});

	// =========================================================================
	// estimateERC20Gas
	// =========================================================================

	describe('estimateERC20Gas(tokenAddress, to, amount)', () => {
		it('returns gas estimation on success', async () => {
			// Set up wallet store with wallet and provider
			mockWalletStoreValue.rsk.wallet = {
				address: '0xabc123'
			};
			mockWalletStoreValue.rsk.provider = {
				getFeeData: vi.fn().mockResolvedValue({
					gasPrice: 60000000n
				})
			};

			const mockEstimateGas = vi.fn().mockResolvedValue(65000n);
			const mockDecimals = vi.fn().mockResolvedValue(18);
			const mockContractInstance = {
				transfer: {
					estimateGas: mockEstimateGas
				},
				decimals: mockDecimals
			};

			mockContractFactory.mockImplementation(function () {
				return mockContractInstance;
			});

			const { estimateERC20Gas } = await import('$lib/stores/wallet/wallet-send');

			const estimation = await estimateERC20Gas('0xTokenAddress', '0xRecipient', '50');

			expect(estimation).toBeDefined();
			expect(estimation.gasLimit).toBe('65000');
			expect(estimation.gasPrice).toBe('60000000');
			expect(estimation.totalCost).toBeDefined();
			expect(estimation.totalCostFormatted).toBeDefined();
		});

		it('throws when wallet is not initialized (no wallet in store)', async () => {
			mockWalletStoreValue.rsk.wallet = null;
			mockWalletStoreValue.rsk.provider = {};

			const { estimateERC20Gas } = await import('$lib/stores/wallet/wallet-send');

			await expect(estimateERC20Gas('0xTokenAddress', '0xRecipient', '50')).rejects.toThrow(
				'RSK wallet not initialized'
			);
		});

		it('throws when provider is not in store', async () => {
			mockWalletStoreValue.rsk.wallet = { address: '0xabc' };
			mockWalletStoreValue.rsk.provider = null;

			const { estimateERC20Gas } = await import('$lib/stores/wallet/wallet-send');

			await expect(estimateERC20Gas('0xTokenAddress', '0xRecipient', '50')).rejects.toThrow(
				'RSK wallet not initialized'
			);
		});

		it('wraps errors with descriptive message', async () => {
			mockWalletStoreValue.rsk.wallet = { address: '0xabc123' };
			mockWalletStoreValue.rsk.provider = {
				getFeeData: vi.fn().mockResolvedValue({ gasPrice: 60000000n })
			};

			const mockEstimateGas = vi.fn().mockRejectedValue(new Error('execution reverted'));
			const mockDecimals = vi.fn().mockResolvedValue(18);
			const mockContractInstance = {
				transfer: {
					estimateGas: mockEstimateGas
				},
				decimals: mockDecimals
			};

			mockContractFactory.mockImplementation(function () {
				return mockContractInstance;
			});

			const { estimateERC20Gas } = await import('$lib/stores/wallet/wallet-send');

			await expect(estimateERC20Gas('0xTokenAddress', '0xRecipient', '50')).rejects.toThrow(
				'ERC-20 gas estimation failed: execution reverted'
			);
		});
	});

	// =========================================================================
	// sendBSCUSDT / sendBSCBNB
	// =========================================================================

	describe('sendBSCUSDT(to, amount)', () => {
		it('returns tx hash on success', async () => {
			const { sendBSCUSDT } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendBSCUSDT('0xrecipient', '100');

			expect(txHash).toBe('0xtxhash-bsc-usdt');
			expect(mockBscWalletSendUSDT).toHaveBeenCalledWith('0xrecipient', '100');
		});

		it('propagates error', async () => {
			mockBscWalletSendUSDT.mockRejectedValueOnce(new Error('USDT transfer failed'));

			const { sendBSCUSDT } = await import('$lib/stores/wallet/wallet-send');

			await expect(sendBSCUSDT('0xrecipient', '100')).rejects.toThrow('USDT transfer failed');
		});
	});

	describe('sendBSCBNB(to, amount)', () => {
		it('returns tx hash on success', async () => {
			const { sendBSCBNB } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendBSCBNB('0xrecipient', '0.1');

			expect(txHash).toBe('0xtxhash-bsc-bnb');
			expect(mockBscWalletSendBNB).toHaveBeenCalledWith('0xrecipient', '0.1');
		});

		it('throws when BSC wallet is not initialized', async () => {
			const originalBscWallet = mockWalletManager.bscWallet;
			mockWalletManager.bscWallet = null as unknown as typeof mockWalletManager.bscWallet;

			const { sendBSCBNB } = await import('$lib/stores/wallet/wallet-send');

			await expect(sendBSCBNB('0xrecipient', '0.1')).rejects.toThrow('BSC wallet not initialized');

			mockWalletManager.bscWallet = originalBscWallet;
		});
	});

	// =========================================================================
	// estimateRBTCGas
	// =========================================================================

	describe('estimateRBTCGas(to, amount)', () => {
		it('returns gas estimation from manager', async () => {
			const expectedEstimation = {
				gasLimit: '21000',
				gasPrice: '60000000',
				totalCost: '1260000000000000',
				totalCostFormatted: '0.00126'
			};
			mockRskWalletEstimateGas.mockResolvedValueOnce(expectedEstimation);

			const { estimateRBTCGas } = await import('$lib/stores/wallet/wallet-send');

			const result = await estimateRBTCGas('0xrecipient', '0.5');

			expect(result).toEqual(expectedEstimation);
			expect(mockRskWalletEstimateGas).toHaveBeenCalledWith('0xrecipient', '0.5');
		});

		it('wraps error with descriptive message', async () => {
			mockRskWalletEstimateGas.mockRejectedValueOnce(new Error('RPC timeout'));

			const { estimateRBTCGas } = await import('$lib/stores/wallet/wallet-send');

			await expect(estimateRBTCGas('0xrecipient', '0.5')).rejects.toThrow(
				'Gas estimation failed: RPC timeout'
			);
		});
	});
});

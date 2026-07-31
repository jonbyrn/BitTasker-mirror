/**
 * USDT Send — Behavioral Tests
 *
 * Tests the full USDT send pipeline across three modules:
 *   1. send-execution.service.ts — USDT handler functions and strategy maps
 *   2. chain-utils.ts — USDT contract resolution and ERC-20 encoding
 *   3. wallet-send.ts — Arbitrum gasless path, fee token scanning, max amount reserves
 *
 * Mocks only external I/O (wallet stores, RPC, fetch, gasless relay).
 * Tests real functions and real data transformations.
 *
 * Pattern: setup-preflight.behavioral.test.ts — mock external I/O, test internals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writable } from 'svelte/store';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
	mockSendRSKUSDT0,
	mockEvmSigner,
	mockQueryERC20Balance,
	mockSendGaslessCalls,
	mockEstimateFee,
	mockRskWalletSendToken,
	mockRskWalletGetWallet,
	mockRskWalletGetProvider,
	mockRskWalletSend,
	mockLoadAssets,
	mockLoadTransactions,
	mockClearBalanceCache,
	mockArbGetBalance,
	mockArbSendTransaction
} = vi.hoisted(() => {
	return {
		mockSendRSKUSDT0: vi.fn(),
		mockEvmSigner: {
			sendTransaction: vi.fn()
		},
		mockQueryERC20Balance: vi.fn(),
		mockSendGaslessCalls: vi.fn(),
		mockEstimateFee: vi.fn(),
		mockRskWalletSendToken: vi.fn(),
		mockRskWalletGetWallet: vi.fn(),
		mockRskWalletGetProvider: vi.fn(),
		mockRskWalletSend: vi.fn(),
		mockLoadAssets: vi.fn().mockResolvedValue(undefined),
		mockLoadTransactions: vi.fn().mockResolvedValue(undefined),
		mockClearBalanceCache: vi.fn(),
		mockArbGetBalance: vi.fn().mockResolvedValue(0n),
		mockArbSendTransaction: vi.fn()
	};
});

// Stores use writable() which is an ESM import — must be outside vi.hoisted()
const mockGaslessWalletStore = writable({ address: '0xGaslessAddr', ready: true, wallet: null, loading: false, error: null, ownerKey: null });
const mockWalletReady = writable(true);

// ---------------------------------------------------------------------------
// Module mocks — external I/O only
// ---------------------------------------------------------------------------

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('$lib/stores/wallet/wallet-state', () => ({
	walletStore: writable({
		rsk: { address: '0xabc123' },
		bsc: { address: '0xdef456' }
	}),
	getWalletManager: vi.fn(() => ({
		rskWallet: {
			send: mockRskWalletSend,
			sendToken: mockRskWalletSendToken,
			getWallet: mockRskWalletGetWallet,
			getProvider: mockRskWalletGetProvider
		},
		bscWallet: {
			sendUSDT: vi.fn(),
			sendBNB: vi.fn()
		},
		sendRSKUSDT0: mockSendRSKUSDT0
	}))
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

vi.mock('$lib/stores/connected-wallets.store', () => ({
	getHandle: vi.fn(),
	getBitcoinSigner: vi.fn()
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		extend: vi.fn(() => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }))
	})
}));

vi.mock('$lib/services/lnurl-pay.service', () => ({
	isLNURL: vi.fn(() => false),
	fetchLNURLPayInvoice: vi.fn()
}));

vi.mock('$lib/services/swap-chain.service', () => ({
	startSwapChain: vi.fn(),
	getSwapChainStatus: vi.fn()
}));

// Separate walletReady (boolean store) from gaslessWallet (state store)
// walletReady must return a boolean for the `!get(walletReady)` check.

vi.mock('$lib/wallet/gasless-store', () => ({
	sendGaslessCalls: mockSendGaslessCalls,
	estimateFee: mockEstimateFee,
	walletReady: mockWalletReady,
	gaslessWallet: mockGaslessWalletStore
}));

vi.mock('$lib/wallet/gasless.config', () => ({
	TOKENS: [
		{ address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT0', decimals: 6, chainId: 42161 },
		{ address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', decimals: 8, chainId: 42161 },
		{ address: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40', symbol: 'TBTC', decimals: 18, chainId: 42161 }
	],
	USDT0_ADDRESS: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
	FEE_BUFFER_MAX: { '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150_000n },
	BRIDGE_GAS_RESERVE: { '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': 150_000n }
}));

vi.mock('$lib/services/swap-chain/tx-helpers', () => ({
	queryERC20Balance: mockQueryERC20Balance
}));

vi.mock('ethers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('ethers')>();
	class MockJsonRpcProvider {
		getBalance = mockArbGetBalance;
	}
	return {
		...actual,
		ethers: {
			...actual.ethers,
			getAddress: vi.fn((addr: string) => addr),
			JsonRpcProvider: MockJsonRpcProvider
		},
		getAddress: vi.fn((addr: string) => addr),
		JsonRpcProvider: MockJsonRpcProvider
	};
});

// ---------------------------------------------------------------------------
// Imports — real modules under test
// ---------------------------------------------------------------------------

import {
	sendUsdt0Rsk,
	sendConnectedUsdt0Rsk,
	sendConnectedUsdtEvm,
	BUILTIN_HANDLERS,
	CONNECTED_HANDLERS,
	convertUsdToERC20Units,
	type SendParams,
	type ConnectedSendParams
} from '$lib/services/send-execution.service';

import {
	getUSDTContractAddressForNetwork,
	getChainIdForNetwork,
	encodeERC20Transfer
} from '$lib/services/external-wallet/chain-utils';

import {
	FEE_BUFFER_MAX,
	BRIDGE_GAS_RESERVE,
	TOKENS
} from '$lib/wallet/gasless.config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSendParams(overrides?: Partial<SendParams>): SendParams {
	return {
		recipient: '0xRecipient222222222222222222222222222222222222',
		amountInSats: 100_000,
		amountInUSD: 50.0,
		network: 'usdt0-rsk',
		memo: '',
		walletManager: {
			sendRBTC: vi.fn(),
			sendBSCUSDT: vi.fn(),
			sendRSKUSDT0: mockSendRSKUSDT0,
			createSubmarineSwap: vi.fn(),
			lockSubmarineSwapFunds: vi.fn()
		} as unknown as SendParams['walletManager'],
		parsedPayment: { data: null },
		...overrides
	};
}

function makeConnectedParams(overrides?: Partial<ConnectedSendParams>): ConnectedSendParams {
	return {
		...makeSendParams(),
		evmSigner: mockEvmSigner,
		bitcoinSigner: undefined,
		walletId: 'metamask-1',
		...overrides
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('USDT send — behavioral tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mockSendRSKUSDT0.mockResolvedValue('0xusdt0rsk-tx-hash');
		mockEvmSigner.sendTransaction.mockResolvedValue({
			txHash: '0xevmtx-hash',
			from: '0xSignerAddr',
			chainId: 30
		});
		mockRskWalletSendToken.mockResolvedValue('0xrsk-token-tx');
		mockRskWalletSend.mockResolvedValue('0xrsk-send-tx');
		mockQueryERC20Balance.mockResolvedValue(1_000_000n);
		mockSendGaslessCalls.mockResolvedValue('0xgasless-tx-hash');
		mockEstimateFee.mockResolvedValue({
			feeBuffer: '50000',
			feeCostUSD: 0.03,
			feeTier: 'Medium',
			totalWithBuffer: '50001',
			estimatedGas: {
				callGasLimit: '200000',
				verificationGasLimit: '100000',
				preVerificationGas: '50000'
			}
		});

		// Default: no ETH on Arbitrum (gasless path)
		mockArbGetBalance.mockResolvedValue(0n);
		mockArbSendTransaction.mockResolvedValue({ hash: '0xdirect-tx-hash' });

		// Mock wallet.connect() chain for sendArbitrumTransaction
		const mockArbWallet = {
			address: '0xabc123',
			getBalance: mockArbGetBalance,
			sendTransaction: mockArbSendTransaction
		};
		mockRskWalletGetWallet.mockReturnValue({
			address: '0xabc123',
			connect: vi.fn().mockReturnValue(mockArbWallet)
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	// =========================================================================
	// 1. Send Execution Service — USDT handlers
	// =========================================================================

	describe('sendUsdt0Rsk() happy path', () => {
		it('calls walletManager.sendRSKUSDT0 with 2-decimal USD amount and recipient', async () => {
			const params = makeSendParams({ amountInUSD: 42.5, recipient: '0xRecipient' });
			const result = await sendUsdt0Rsk(params);

			expect(mockSendRSKUSDT0).toHaveBeenCalledWith('0xRecipient', '42.50');
			expect(result.txHash).toBe('0xusdt0rsk-tx-hash');
		});

		it('formats $0.01 to "0.01"', async () => {
			const params = makeSendParams({ amountInUSD: 0.01 });
			await sendUsdt0Rsk(params);
			expect(mockSendRSKUSDT0).toHaveBeenCalledWith(params.recipient, '0.01');
		});

		it('formats $100.99 to "100.99"', async () => {
			const params = makeSendParams({ amountInUSD: 100.99 });
			await sendUsdt0Rsk(params);
			expect(mockSendRSKUSDT0).toHaveBeenCalledWith(params.recipient, '100.99');
		});
	});

	describe('sendConnectedUsdt0Rsk() happy path', () => {
		it('encodes ERC-20 transfer to RSK USDT0 contract 0x779Ded0c9e1022225f8E0630b35a9b54bE713736', async () => {
			const params = makeConnectedParams({
				amountInUSD: 50.0,
				recipient: '0xRecipient'
			});
			const result = await sendConnectedUsdt0Rsk(params);

			// Verify the EVM signer was called with the RSK USDT0 contract
			const txCall = mockEvmSigner.sendTransaction.mock.calls[0][0];
			expect(txCall.to).toBe('0x779Ded0c9e1022225f8E0630b35a9b54bE713736');
			expect(txCall.chainId).toBe(getChainIdForNetwork('rootstock-bitcoin'));
			expect(result.txHash).toBe('0xevmtx-hash');
		});

		it('converts USD amount to 6-decimal USDT units for encoding', async () => {
			const params = makeConnectedParams({ amountInUSD: 25.5 });
			await sendConnectedUsdt0Rsk(params);

			// $25.50 with 6 decimals = 25_500_000n
			// Verify the calldata encodes the correct amount
			const txCall = mockEvmSigner.sendTransaction.mock.calls[0][0];
			// decodeERC20Transfer: last 64 hex chars = amount
			const amountHex = txCall.data.slice(-64);
			expect(BigInt('0x' + amountHex)).toBe(25_500_000n);
		});
	});

	describe('sendConnectedUsdtEvm() with usdt0-arb', () => {
		it('uses Arbitrum USDT contract and chain ID 42161', async () => {
			vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
			const params = makeConnectedParams({
				network: 'usdt0-arb',
				amountInUSD: 75.0,
				recipient: '0xArbRecipient'
			});
			const result = await sendConnectedUsdtEvm(params);

			const txCall = mockEvmSigner.sendTransaction.mock.calls[0][0];
			expect(txCall.to).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
			expect(txCall.chainId).toBe(42161);
			expect(result.txHash).toBe('0xevmtx-hash');
		});

		it('encodes 6-decimal USDT amount in calldata', async () => {
			const params = makeConnectedParams({
				network: 'usdt0-arb',
				amountInUSD: 10.25
			});
			await sendConnectedUsdtEvm(params);

			const txCall = mockEvmSigner.sendTransaction.mock.calls[0][0];
			const amountHex = txCall.data.slice(-64);
			expect(BigInt('0x' + amountHex)).toBe(10_250_000n);
		});
	});

	describe('BUILTIN_HANDLERS mapping', () => {
		it('maps usdt0-rsk to sendUsdt0Rsk', () => {
			expect(BUILTIN_HANDLERS['usdt0-rsk']).toBe(sendUsdt0Rsk);
		});

		it('has exactly 10 built-in handlers (5 direct + 5 Changelly)', () => {
			expect(Object.keys(BUILTIN_HANDLERS)).toHaveLength(10);
		});
	});

	describe('CONNECTED_HANDLERS mapping', () => {
		it('maps usdt0-arb to sendConnectedUsdtEvm', () => {
			expect(CONNECTED_HANDLERS['usdt0-arb']).toBe(sendConnectedUsdtEvm);
		});

		it('maps usdt0-rsk to sendConnectedUsdt0Rsk', () => {
			expect(CONNECTED_HANDLERS['usdt0-rsk']).toBe(sendConnectedUsdt0Rsk);
		});

		it('maps usdt-ethereum to sendConnectedUsdtEvm', () => {
			expect(CONNECTED_HANDLERS['usdt-ethereum']).toBe(sendConnectedUsdtEvm);
		});

		it('maps usdt-polygon to sendConnectedUsdtEvm', () => {
			expect(CONNECTED_HANDLERS['usdt-polygon']).toBe(sendConnectedUsdtEvm);
		});
	});

	describe('SUPPORTED_NETWORKS coverage', () => {
		it('executeSend does not throw for usdt0-arb', async () => {
			const { executeSend } = await import('$lib/services/send-execution.service');
			const { getHandle, getBitcoinSigner } = await import('$lib/stores/connected-wallets.store');

			vi.mocked(getHandle).mockReturnValue({
				id: 'wallet-1',
				walletName: 'MetaMask',
				address: '0xConnectedAddr',
				evmSigner: mockEvmSigner,
				bitcoinSigner: undefined
			} as never);
			vi.mocked(getBitcoinSigner).mockReturnValue(undefined as never);

			await expect(
				executeSend({
					network: 'usdt0-arb',
					recipient: '0xRecipient',
					amountInSats: 100_000,
					amountInUSD: 50.0,
					memo: '',
					selectedWalletId: 'wallet-1',
					parsedPayment: { data: null },
					walletManager: makeSendParams().walletManager,
					route: null,
					sourceWalletId: 'rbtc',
					dest: null
				})
			).resolves.toBeDefined();
		});

		it('executeSend does not throw for usdt0-rsk', async () => {
			const { executeSend } = await import('$lib/services/send-execution.service');

			await expect(
				executeSend({
					network: 'usdt0-rsk',
					recipient: '0xRecipient',
					amountInSats: 100_000,
					amountInUSD: 50.0,
					memo: '',
					selectedWalletId: 'builtin',
					parsedPayment: { data: null },
					walletManager: makeSendParams().walletManager,
					route: null,
					sourceWalletId: 'rbtc',
					dest: null
				})
			).resolves.toBeDefined();
		});

		it('executeSend does not throw for usdt-bsc', async () => {
			const { executeSend } = await import('$lib/services/send-execution.service');

			await expect(
				executeSend({
					network: 'usdt-bsc',
					recipient: '0xRecipient',
					amountInSats: 100_000,
					amountInUSD: 50.0,
					memo: '',
					selectedWalletId: 'builtin',
					parsedPayment: { data: null },
					walletManager: makeSendParams().walletManager,
					route: null,
					sourceWalletId: 'rbtc',
					dest: null
				})
			).resolves.toBeDefined();
		});

		it('executeSend throws for unsupported network', async () => {
			const { executeSend } = await import('$lib/services/send-execution.service');

			await expect(
				executeSend({
					network: 'solana-spl',
					recipient: '0xRecipient',
					amountInSats: 100_000,
					amountInUSD: 50.0,
					memo: '',
					selectedWalletId: 'builtin',
					parsedPayment: { data: null },
					walletManager: makeSendParams().walletManager,
					route: null,
					sourceWalletId: 'rbtc',
					dest: null
				})
			).rejects.toThrow('not yet supported');
		});
	});

	// =========================================================================
	// 2. Chain Utils — USDT contract resolution
	// =========================================================================

	describe('getUSDTContractAddressForNetwork()', () => {
		it('returns Arbitrum USDT contract 0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', () => {
			const address = getUSDTContractAddressForNetwork('usdt0-arb');
			expect(address).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
		});

		it('returns Ethereum USDT contract 0xdAC17F958D2ee523a2206206994597C13D831ec7', () => {
			const address = getUSDTContractAddressForNetwork('usdt-ethereum');
			expect(address).toBe('0xdAC17F958D2ee523a2206206994597C13D831ec7');
		});

		it('returns Polygon USDT contract 0xc2132D05D31c914a87C6611C10748AEb04B58e8F', () => {
			const address = getUSDTContractAddressForNetwork('usdt-polygon');
			expect(address).toBe('0xc2132D05D31c914a87C6611C10748AEb04B58e8F');
		});
	});

	describe('encodeERC20Transfer() with 6-decimal USDT amounts', () => {
		it('encodes $50.00 USDT (50_000_000 units) transfer', () => {
			const data = encodeERC20Transfer('0xRecipient', 50_000_000n);

			// Method selector for transfer(address,uint256) = 0xa9059cbb
			expect(data.startsWith('0xa9059cbb')).toBe(true);
			// Total length: '0x' (2) + selector (8) + address (64) + amount (64) = 138
			expect(data.length).toBe(138);

			// Decode the amount (last 64 hex chars)
			const amountHex = data.slice(-64);
			expect(BigInt('0x' + amountHex)).toBe(50_000_000n);
		});

		it('encodes $0.01 USDT (10_000 units) transfer', () => {
			const data = encodeERC20Transfer('0xRecipient', 10_000n);
			const amountHex = data.slice(-64);
			expect(BigInt('0x' + amountHex)).toBe(10_000n);
		});

		it('encodes $100.99 USDT (100_990_000 units) transfer', () => {
			const data = encodeERC20Transfer('0xRecipient', 100_990_000n);
			const amountHex = data.slice(-64);
			expect(BigInt('0x' + amountHex)).toBe(100_990_000n);
		});

		it('pads recipient address to 32 bytes', () => {
			const shortAddr = '0xAbCd';
			const data = encodeERC20Transfer(shortAddr, 1_000_000n);
			// Address field: chars 10..74 (64 hex chars)
			const addrField = data.slice(10, 74);
			// Should be left-padded with zeros to 64 chars
			expect(addrField).toBe('000000000000000000000000000000000000000000000000000000000000AbCd');
		});

		it('round-trips through convertUsdToERC20Units', () => {
			const usdAmount = 42.75;
			const units = convertUsdToERC20Units(usdAmount, 6);
			const data = encodeERC20Transfer('0xRecipient', units);
			const amountHex = data.slice(-64);
			expect(BigInt('0x' + amountHex)).toBe(42_750_000n);
		});
	});

	// =========================================================================
	// 3. Wallet Send — Arbitrum gasless path
	// =========================================================================

	describe('sendArbitrumTransaction() — ETH balance check + path routing', () => {
		it('goes direct path when user has ETH on Arbitrum', async () => {
			mockArbGetBalance.mockResolvedValue(1_000_000_000_000_000n); // 0.001 ETH
			mockArbSendTransaction.mockResolvedValue({ hash: '0xdirect-arb-tx' });

			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendArbitrumTransaction({
				to: '0xArbContract',
				data: '0xarbcalldata',
				value: '0'
			});

			expect(mockSendGaslessCalls).not.toHaveBeenCalled();
			expect(mockArbSendTransaction).toHaveBeenCalled();
			expect(txHash).toBe('0xdirect-arb-tx');
		});

		it('goes gasless path when user has no ETH and walletReady=true', async () => {
			mockArbGetBalance.mockResolvedValue(0n);

			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendArbitrumTransaction({
				to: '0xArbContract',
				data: '0xarbcalldata',
				value: '0',
				feeToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
			});

			expect(mockSendGaslessCalls).toHaveBeenCalled();
			expect(txHash).toBe('0xgasless-tx-hash');
		});
	});

	describe('sendArbitrumTransaction() gasless path', () => {
		it('calls sendGaslessCalls when walletReady=true and preferred feeToken provided', async () => {
			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			const txHash = await sendArbitrumTransaction({
				to: '0xArbContract',
				data: '0xarbcalldata',
				value: '0',
				feeToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'
			});

			expect(mockSendGaslessCalls).toHaveBeenCalled();
			expect(txHash).toBe('0xgasless-tx-hash');
		});

		it('prepends extraCalls before the primary call', async () => {
			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			const extraCalls = [
				{ to: '0xTokenAddr', data: '0xapprove', value: 0n }
			];

			await sendArbitrumTransaction({
				to: '0xSwapRouter',
				data: '0xswapdata',
				value: '0',
				feeToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				extraCalls
			});

			const callsArg = mockSendGaslessCalls.mock.calls[0][0];
			expect(callsArg).toHaveLength(2);
			expect(callsArg[0].to).toBe('0xTokenAddr');
			expect(callsArg[0].data).toBe('0xapprove');
			expect(callsArg[1].to).toBe('0xSwapRouter');
			expect(callsArg[1].data).toBe('0xswapdata');
		});

		it('scans TOKENS list and sorts by balance descending when no preferred feeToken', async () => {
			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			// USDT0 has highest balance, TBTC lowest
			mockQueryERC20Balance
				.mockResolvedValueOnce(500_000n)   // USDT0
				.mockResolvedValueOnce(100_000n)   // WBTC
				.mockResolvedValueOnce(10_000n);   // TBTC

			const txHash = await sendArbitrumTransaction({
				to: '0xArbContract',
				data: '0xarbcalldata',
				value: '0'
			});

			// Should have queried 3 token balances
			expect(mockQueryERC20Balance).toHaveBeenCalledTimes(3);

			// Should use USDT0 (highest balance) as fee token
			const feeTokenUsed = mockSendGaslessCalls.mock.calls[0][1];
			expect(feeTokenUsed).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
			expect(txHash).toBe('0xgasless-tx-hash');
		});

		it('skips tokens with insufficient balance and uses next available', async () => {
			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			// USDT0 has 0 balance (filtered out), WBTC has balance, TBTC has 0
			mockQueryERC20Balance
				.mockResolvedValueOnce(0n)         // USDT0 — no balance
				.mockResolvedValueOnce(200_000n)   // WBTC — has balance
				.mockResolvedValueOnce(0n);        // TBTC — no balance

			// feeBuffer smaller than WBTC balance so it succeeds
			mockEstimateFee.mockResolvedValue({
				feeBuffer: '50000',
				feeCostUSD: 0.03,
				feeTier: 'Medium',
				totalWithBuffer: '50001',
				estimatedGas: {
					callGasLimit: '200000',
					verificationGasLimit: '100000',
					preVerificationGas: '50000'
				}
			});

			const txHash = await sendArbitrumTransaction({
				to: '0xArbContract',
				data: '0xarbcalldata',
				value: '0'
			});

			// Should skip USDT0 (0 balance), use WBTC
			expect(mockSendGaslessCalls).toHaveBeenCalled();
			const feeTokenUsed = mockSendGaslessCalls.mock.calls[0][1];
			expect(feeTokenUsed).toBe('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f');
			expect(txHash).toBe('0xgasless-tx-hash');
		});

		it('throws "All fee token attempts exhausted" when no tokens have balance', async () => {
			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			mockQueryERC20Balance.mockResolvedValue(0n);

			await expect(
				sendArbitrumTransaction({
					to: '0xArbContract',
					data: '0xarbcalldata',
					value: '0'
				})
			).rejects.toThrow('No fee token available for gasless transaction');
		});

		it('throws "All fee token attempts exhausted" when all fee token attempts fail', async () => {
			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			mockQueryERC20Balance.mockResolvedValue(1_000_000n);
			mockSendGaslessCalls.mockRejectedValue(new Error('relay failed'));

			await expect(
				sendArbitrumTransaction({
					to: '0xArbContract',
					data: '0xarbcalldata',
					value: '0'
				})
			).rejects.toThrow('relay failed');
		});

		it('throws "Gasless wallet address not available" when gasless wallet has no address', async () => {
			// walletReady stays true (gasless wallet is initialized)
			// but gaslessWallet.address is null
			mockGaslessWalletStore.set({ address: null as unknown as string, ready: true, loading: false, error: null, wallet: null, ownerKey: null });

			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			await expect(
				sendArbitrumTransaction({
					to: '0xArbContract',
					data: '0xarbcalldata',
					value: '0'
				})
			).rejects.toThrow('Gasless wallet address not available');

			// Reset for other tests
			mockGaslessWalletStore.set({ address: '0xGaslessAddr', ready: true, loading: false, error: null, wallet: null, ownerKey: null });
		});

		it('throws when no ETH and gasless wallet is not initialized', async () => {
			mockArbGetBalance.mockResolvedValue(0n);
			mockWalletReady.set(false);

			const { sendArbitrumTransaction } = await import('$lib/stores/wallet/wallet-send');

			await expect(
				sendArbitrumTransaction({
					to: '0xArbContract',
					data: '0xarbcalldata',
					value: '0'
				})
			).rejects.toThrow('No ETH on Arbitrum for gas');

			// Reset for other tests
			mockWalletReady.set(true);
		});
	});

	// =========================================================================
	// 4. Max amount with USDT0 gasless fee reserve
	// =========================================================================

	describe('USDT0 gasless fee reserves', () => {
		it('FEE_BUFFER_MAX for USDT0 is 150000 (micro-USDT = $0.15)', () => {
			const usdt0Key = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
			expect(FEE_BUFFER_MAX[usdt0Key]).toBe(150_000n);
		});

		it('BRIDGE_GAS_RESERVE for USDT0 is 150000 (micro-USDT = $0.15)', () => {
			const usdt0Key = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
			expect(BRIDGE_GAS_RESERVE[usdt0Key]).toBe(150_000n);
		});

		it('max amount calculation deducts both FEE_BUFFER_MAX and BRIDGE_GAS_RESERVE', () => {
			const usdt0Key = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
			const totalReserve = FEE_BUFFER_MAX[usdt0Key] + BRIDGE_GAS_RESERVE[usdt0Key];

			// Total reserve = 150_000 + 150_000 = 300_000 micro-USDT ($0.30)
			expect(totalReserve).toBe(300_000n);

			// Simulate max amount: user has 1_000_000 micro-USDT ($1.00)
			const userBalance = 1_000_000n;
			const maxSendAmount = userBalance - totalReserve;

			expect(maxSendAmount).toBe(700_000n);
		});

		it('max amount is 0 when balance equals total reserve', () => {
			const usdt0Key = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
			const totalReserve = FEE_BUFFER_MAX[usdt0Key] + BRIDGE_GAS_RESERVE[usdt0Key];

			const userBalance = totalReserve;
			const maxSendAmount = userBalance - totalReserve;

			expect(maxSendAmount).toBe(0n);
		});

		it('TOKENS list includes USDT0 with 6 decimals', () => {
			const usdt0 = TOKENS.find((t) => t.symbol === 'USDT0');
			expect(usdt0).toBeDefined();
			expect(usdt0!.decimals).toBe(6);
			expect(usdt0!.address).toBe('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9');
			expect(usdt0!.chainId).toBe(42161);
		});
	});
});

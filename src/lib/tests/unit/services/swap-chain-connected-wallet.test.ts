/**
 * Swap-Chain Service — Connected Wallet Unit Tests
 *
 * Comprehensive tests for all connected wallet code paths across every hop type:
 *   - Direct hop (RBTC, USDT ERC-20)
 *   - LI.FI hop
 *   - Symbiosis hop
 *   - Boltz hop (submarine, chain swap RBTC→BTC, chain swap RBTC→Arbitrum)
 *   - Changelly hop (intermediate address resolution)
 *   - Error paths (missing signer, invalid amounts, unsupported assets)
 *
 * Tests exercise the public `startSwapChain()` entry point with all external
 * dependencies mocked — no real network calls, no hardware wallets.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startSwapChain, resumeSwapChain } from '$lib/services/swap-chain.service';
import type { Route, RouteHop, Destination } from '$lib/services/route-resolver';
import type {
	EVMSigner,
	EVMTransactionRequest,
	EVMTransactionResult
} from '$lib/services/external-wallet/types';
import type { SwapChainState, SwapChainPhase } from '$lib/services/swap-chain.service';

// ---------------------------------------------------------------------------
// Mock fetch for waitForReceipt — returns a successful receipt by default
// ---------------------------------------------------------------------------

const mockFetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

function setupFetchMock(): void {
	mockFetch.mockResolvedValue({
		ok: true,
		json: () =>
			Promise.resolve({
				result: { status: '0x1', gasUsed: '0x5208' } // success, 21000 gas
			})
	} as Response);
	globalThis.fetch = mockFetch;
}

// ---------------------------------------------------------------------------
// Hoisted mutable mocks — shared between vi.mock factories and test assertions
// ---------------------------------------------------------------------------

const {
	mockEvmSigner,
	mockHandle,
	mockWalletState,
	mockSendRBTC,
	mockSendBSCUSDT,
	mockSendRawTransaction,
	mockSendArbitrumTransaction,
	mockCreateSubmarineSwap,
	mockLockSubmarineSwapFunds,
	mockCreateChainSwap,
	mockLifiGetStepTransaction,
	mockSymbiosisGetQuote,
	mockChangellyCreateSwap,
	mockChangellyGetSwapStatus,
	mockBoltzCreateReverseSwap,
	mockBoltzCreateSubSwap,
	mockBoltzCreateSwap,
	mockEncodeERC20Transfer,
	mockGetBSCUSDTContractAddress,
	mockPreferencesGet,
	mockPreferencesSet,
	mockPreferencesRemove
} = vi.hoisted(() => {
	const signer: EVMSigner = {
		type: 'evm',
		label: 'MetaMask',
		address: '0xAAaA000000000000000000000000000000000001',
		chainId: 30,
		sendTransaction: vi.fn<[EVMTransactionRequest], Promise<EVMTransactionResult>>(),
		getAddress: vi.fn(() => '0xAAaA000000000000000000000000000000000001'),
		isConnected: vi.fn(() => true)
	};

	const handle = {
		id: 'metamask-1',
		walletName: 'MetaMask',
		walletType: 'metamask' as const,
		address: '0xAAaA000000000000000000000000000000000001',
		chainIds: [30, 56, 42161],
		evmSigner: signer,
		provider: null,
		onEvent: vi.fn(),
		unsubscribe: vi.fn()
	};

	const wallet = {
		isConnected: true,
		rsk: {
			address: '0xBbbb000000000000000000000000000000000002',
			balance: '0',
			formattedBalance: '0.00',
			connected: true,
			connecting: false,
			error: null,
			blockNumber: null,
			provider: null,
			wallet: null
		},
		bsc: { address: '0xccCc000000000000000000000000000000000003' },
		arb: { address: '0xddDD000000000000000000000000000000000004' }
	};

	return {
		mockEvmSigner: signer,
		mockHandle: handle,
		mockWalletState: wallet,
		mockSendRBTC: vi.fn(),
		mockSendBSCUSDT: vi.fn(),
		mockSendRawTransaction: vi.fn(),
		mockSendArbitrumTransaction: vi.fn(),
		mockCreateSubmarineSwap: vi.fn(),
		mockLockSubmarineSwapFunds: vi.fn(),
		mockCreateChainSwap: vi.fn(),
		mockLifiGetStepTransaction: vi.fn(),
		mockSymbiosisGetQuote: vi.fn(),
		mockChangellyCreateSwap: vi.fn(),
		mockChangellyGetSwapStatus: vi.fn(),
		mockBoltzCreateReverseSwap: vi.fn(),
		mockBoltzCreateSubSwap: vi.fn(),
		mockBoltzCreateSwap: vi.fn(),
		mockEncodeERC20Transfer: vi.fn(),
		mockGetBSCUSDTContractAddress: vi.fn(),
		mockPreferencesGet: vi.fn(),
		mockPreferencesSet: vi.fn(),
		mockPreferencesRemove: vi.fn()
	};
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		error: vi.fn(),
		warn: vi.fn(),
		extend: () => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn() })
	}),
	debug: { enable: vi.fn() }
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn(),
	setUser: vi.fn(),
	setTag: vi.fn(),
	setContext: vi.fn()
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: vi.fn(() => null)
}));

vi.mock('$lib/utils/swapAdapter', () => ({
	saveSwapToNostr: vi.fn(),
	recoverSwapsFromNostr: vi.fn(() => [])
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: mockPreferencesGet,
		set: mockPreferencesSet,
		remove: mockPreferencesRemove
	}
}));

vi.mock('$lib/services/external-wallet/chain-utils', () => ({
	encodeERC20Transfer: mockEncodeERC20Transfer,
	getBSCUSDTContractAddress: mockGetBSCUSDTContractAddress,
	getChainIdForNetwork: vi.fn()
}));

vi.mock('$lib/stores/wallet.store', () => {
	const store = {
		subscribe: vi.fn((fn: (v: typeof mockWalletState) => void) => {
			fn(mockWalletState);
			return vi.fn();
		}),
		update: vi.fn(),
		set: vi.fn()
	};
	return {
		walletStore: store,
		sendRBTC: mockSendRBTC,
		sendBSCUSDT: mockSendBSCUSDT,
		sendRawTransaction: mockSendRawTransaction,
		sendArbitrumTransaction: mockSendArbitrumTransaction,
		createSubmarineSwap: mockCreateSubmarineSwap,
		lockSubmarineSwapFunds: mockLockSubmarineSwapFunds,
		createChainSwap: mockCreateChainSwap,
		getRSKAddress: vi.fn().mockResolvedValue('0xAAAA000000000000000000000000000000000001')
	};
});

vi.mock('$lib/stores/connected-wallets.store', () => ({
	getEvmSigner: vi.fn((id: string) => (id === 'metamask-1' ? mockEvmSigner : undefined)),
	getHandle: vi.fn((id: string) => (id === 'metamask-1' ? mockHandle : undefined)),
	getBitcoinSigner: vi.fn()
}));

vi.mock('$lib/services/lifi.service', () => ({
	lifiService: { getStepTransaction: mockLifiGetStepTransaction }
}));

vi.mock('$lib/services/symbiosis.service', () => ({
	symbiosisService: {
		getQuote: mockSymbiosisGetQuote,
		getSwapStatus: vi.fn().mockResolvedValue({
			status: { code: 0, text: 'Relayed' }
		})
	}
}));

vi.mock('$lib/services/changelly.service', () => ({
	changellyService: {
		createSwap: mockChangellyCreateSwap,
		getSwapStatus: mockChangellyGetSwapStatus
	}
}));

vi.mock('$lib/services/BoltzProvider', () => {
	const MockBoltzProvider = vi.fn().mockImplementation(function () {
		this.createReverseSwap = mockBoltzCreateReverseSwap;
		this.createSubmarineSwap = mockBoltzCreateSubSwap;
		this.createSwap = mockBoltzCreateSwap;
	});
	return {
		BoltzProvider: MockBoltzProvider,
		boltzProvider: new MockBoltzProvider()
	};
});

vi.mock('ethers', async (importOriginal) => {
	const real = await importOriginal<typeof import('ethers')>();
	return {
		ethers: {
			Wallet: {
				createRandom: vi.fn(() => ({
					publicKey: '0x04mockpublickey1234567890abcdef1234567890abcdef1234567890abcdef12',
					address: '0x7777000000000000000000000000000000000Aaa'
				}))
			},
			Interface: vi.fn().mockImplementation(function () {
				this.encodeFunctionData = vi.fn(() => '0xlockcalldata');
			}),
			Transaction: vi.fn(),
			toQuantity: vi.fn(),
			Signature: { from: vi.fn() },
			getAddress: vi.fn((addr: string) => {
				try {
					return real.ethers.getAddress(addr.toLowerCase());
				} catch {
					return addr;
				}
			})
		}
	};
});

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeDestination(address: string): Destination {
	return { type: 'address', chainId: 30, address };
}

function makeInvoiceDest(invoice: string): Destination {
	return { type: 'invoice', network: 'lightning', invoice };
}

function makeDirectHopRBTC(): RouteHop {
	return {
		service: 'direct',
		fromAsset: 'RBTC',
		fromChain: 'rsk',
		toAsset: 'RBTC',
		toChain: 'rsk',
		feePercent: 0,
		estimatedTimeMin: 1,
		estimatedTimeMax: 5
	};
}

function makeDirectHopUSDT(): RouteHop {
	return {
		service: 'direct',
		fromAsset: 'USDT',
		fromChain: 'bsc',
		toAsset: 'USDT',
		toChain: 'bsc',
		feePercent: 0,
		estimatedTimeMin: 1,
		estimatedTimeMax: 5
	};
}

function makeDirectHopUnsupported(): RouteHop {
	return {
		service: 'direct',
		fromAsset: 'DOC',
		fromChain: 'rsk',
		toAsset: 'DOC',
		toChain: 'rsk',
		feePercent: 0,
		estimatedTimeMin: 1,
		estimatedTimeMax: 5
	};
}

function makeLifiHop(fromChain = 'rsk', toChain = 'arbitrum'): RouteHop {
	return {
		service: 'lifi',
		fromAsset: 'RBTC',
		fromChain,
		toAsset: 'TBTC',
		toChain,
		feePercent: 0.5,
		estimatedTimeMin: 5,
		estimatedTimeMax: 30
	};
}

function makeSymbiosisHop(): RouteHop {
	return {
		service: 'symbiosis',
		fromAsset: 'RBTC',
		fromChain: 'rsk',
		toAsset: 'USDT',
		toChain: 'bsc',
		feePercent: 0.5,
		estimatedTimeMin: 5,
		estimatedTimeMax: 30
	};
}

function makeBoltzSubmarineHop(): RouteHop {
	return {
		service: 'boltz',
		fromAsset: 'RBTC',
		fromChain: 'rsk',
		toAsset: 'BTC',
		toChain: 'lightning',
		feePercent: 0.5,
		estimatedTimeMin: 5,
		estimatedTimeMax: 60
	};
}

function makeBoltzChainBtcHop(): RouteHop {
	return {
		service: 'boltz',
		fromAsset: 'RBTC',
		fromChain: 'rsk',
		toAsset: 'BTC',
		toChain: 'bitcoin',
		feePercent: 0.5,
		estimatedTimeMin: 5,
		estimatedTimeMax: 60
	};
}

function makeBoltzChainArbHop(): RouteHop {
	return {
		service: 'boltz',
		fromAsset: 'RBTC',
		fromChain: 'rsk',
		toAsset: 'TBTC',
		toChain: 'arbitrum',
		feePercent: 0.5,
		estimatedTimeMin: 5,
		estimatedTimeMax: 60
	};
}

function makeChangellyHop(fromAsset = 'USDT', toAsset = 'RBTC', toChain = 'rsk'): RouteHop {
	return {
		service: 'changelly',
		fromAsset,
		fromChain: 'bsc',
		toAsset,
		toChain,
		feePercent: 0.5,
		estimatedTimeMin: 10,
		estimatedTimeMax: 60
	};
}

function makeRoute(hops: RouteHop[], id = 'test-route'): Route {
	return {
		id,
		label: 'Test Route',
		hops,
		totalFeePercent: hops.reduce((sum, h) => sum + h.feePercent, 0),
		estimatedTime: `${hops[0].estimatedTimeMin}-${hops[hops.length - 1].estimatedTimeMax} min`,
		recommended: false
	};
}

/** Verify a result is a completed swap chain state with the expected phase and swap1Id. */
function assertCompleted(
	result: { data: SwapChainState | null; error: Error | null },
	expectedPhase: SwapChainPhase,
	expectedSwap1Id?: string | null
): void {
	expect(result.error).toBeNull();
	expect(result.data).not.toBeNull();
	expect(result.data!.phase).toBe(expectedPhase);
	if (expectedSwap1Id !== undefined) {
		expect(result.data!.swap1Id).toBe(expectedSwap1Id);
	}
}

/** Verify a result is a failed swap chain state. */
function assertFailed(
	result: { data: SwapChainState | null; error: Error | null },
	expectedErrorSubstring: string
): void {
	expect(result.data).not.toBeNull();
	expect(result.data!.phase).toBe('FAILED');
	expect(result.data!.error).toContain(expectedErrorSubstring);
}

// ---------------------------------------------------------------------------
// BeforeEach / AfterEach
// ---------------------------------------------------------------------------

/**
 * Reset all mock state between tests.
 *
 * NOTE: We do NOT use vi.clearAllMocks() because it corrupts vi.hoisted()
 * mock references used inside BoltzProvider constructor factories (causing
 * "boltz.createSwap is not a function" errors). Instead, we manually reset
 * only mock call history and re-apply default resolved values.
 */
function resetMocks(): void {
	// Clear call history on all hoisted mocks
	const allHoisted = [
		mockEvmSigner.sendTransaction,
		mockEvmSigner.getAddress,
		mockEvmSigner.isConnected,
		mockSendRBTC,
		mockSendBSCUSDT,
		mockSendRawTransaction,
		mockSendArbitrumTransaction,
		mockCreateSubmarineSwap,
		mockLockSubmarineSwapFunds,
		mockCreateChainSwap,
		mockLifiGetStepTransaction,
		mockSymbiosisGetQuote,
		mockChangellyCreateSwap,
		mockChangellyGetSwapStatus,
		mockBoltzCreateReverseSwap,
		mockBoltzCreateSubSwap,
		mockBoltzCreateSwap,
		mockEncodeERC20Transfer,
		mockGetBSCUSDTContractAddress,
		mockPreferencesGet,
		mockPreferencesSet,
		mockPreferencesRemove,
		mockFetch
	];
	for (const m of allHoisted) {
		m.mockClear();
	}

	// Re-apply default resolved values

	// Default: Preferences.get returns empty (no persisted state)
	mockPreferencesGet.mockResolvedValue({ value: null });
	mockPreferencesSet.mockResolvedValue(undefined);
	mockPreferencesRemove.mockResolvedValue(undefined);

	// Default: connected wallet signer returns success
	mockEvmSigner.sendTransaction.mockResolvedValue({
		txHash: '0xtxhashCONNECTEDWALLETabcdef1234567890',
		from: mockEvmSigner.address,
		chainId: 30
	});

	// Default: wallet store functions succeed
	mockSendRBTC.mockResolvedValue('0xtxhashBUILTINrbtc');
	mockSendBSCUSDT.mockResolvedValue('0xtxhashBUILTINusdtbsc');
	mockSendRawTransaction.mockResolvedValue('0xtxhashBUILTINraw');
	mockSendArbitrumTransaction.mockResolvedValue('0xtxhashBUILTINarb');

	// Default: LI.FI returns a step transaction
	mockLifiGetStepTransaction.mockResolvedValue({
		to: '0x1111000000000000000000000000000000000aAA',
		data: '0xlificalldata',
		value: '1000000000000000000'
	});

	// Default: Symbiosis returns a quote with tx data
	mockSymbiosisGetQuote.mockResolvedValue({
		tx: {
			to: '0x2222000000000000000000000000000000000BbB',
			data: '0xsymbcalldata',
			value: '1000000000000000000'
		}
	});

	// Default: Changelly creates swap and completes immediately
	mockChangellyCreateSwap.mockResolvedValue({ id: 'changelly-swap-123' });
	mockChangellyGetSwapStatus.mockResolvedValue({ status: 'finished' });

	// Default: Boltz mocks
	mockBoltzCreateReverseSwap.mockResolvedValue({
		swapId: 'reverse-swap-1',
		invoice: 'lnbc1mockinvoice'
	});
	mockBoltzCreateSubSwap.mockResolvedValue({
		swapId: 'sub-swap-1',
		lockupAddress: '0x3333000000000000000000000000000000000CCc'
	});
	mockBoltzCreateSwap.mockResolvedValue({
		swapId: 'chain-swap-1',
		lockupAddress: '0x4444000000000000000000000000000000000DDd',
		claimAddress: '0xE1D3F94d0b1aBEbdbE5e722e68CdEcA94a8e7d41',
		timeoutBlockHeight: 8950000
	});

	// Default: chain-utils
	mockEncodeERC20Transfer.mockReturnValue(
		'0xa9059cbb000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001'
	);
	mockGetBSCUSDTContractAddress.mockReturnValue('0x337610d27c682E347C9cD60BD4b3b107C9d34dDd');

	// Default: fetch mock for waitForReceipt — returns successful receipt
	setupFetchMock();

	// Default: submarine swap returns data with lockup address (expectedAmount as string, not bigint — the code only accepts number|string)
	mockCreateSubmarineSwap.mockResolvedValue({
		swapId: 'sub-swap-rbtc-ln-1',
		invoice: 'lnbc1mock',
		swapData: {
			lockupAddress: '0x5555000000000000000000000000000000000eee',
			expectedAmount: '1000000000000000000'
		}
	});
	mockLockSubmarineSwapFunds.mockResolvedValue({ txHash: '0xtxhashBUILTINlockup' });

	// Default: chain swap for built-in wallet
	mockCreateChainSwap.mockResolvedValue({ swapId: 'builtin-chain-swap-1' });
}

beforeEach(() => {
	resetMocks();
});

afterEach(() => {
	// NOTE: Do NOT use vi.restoreAllMocks() — it removes mockImplementation
	// from vi.hoisted() BoltzProvider factory, breaking boltz.createSwap.
	// resetMocks() in beforeEach handles all cleanup.
});

// ===========================================================================
// Tests
// ===========================================================================

describe('Swap-Chain Connected Wallet Support', () => {
	const DEST_ADDR = '0x6666000000000000000000000000000000000FFF';
	const CONNECTED_WALLET_ID = 'metamask-1';
	const VALID_AMOUNT = '0.5';

	// =========================================================================
	// Direct Hop — Connected Wallet
	// =========================================================================

	describe('Direct Hop — Connected Wallet', () => {
		it('executes RBTC transfer via evmSigner.sendTransaction with correct params', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashCONNECTEDWALLETabcdef1234567890');
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledTimes(1);
			const txArg = mockEvmSigner.sendTransaction.mock.calls[0][0] as EVMTransactionRequest;
			expect(txArg.to).toBe(DEST_ADDR);
			expect(txArg.chainId).toBe(30);
			expect(txArg.data).toBe('0x');
			expect(txArg.value).toBeDefined();
			// Built-in wallet functions must NOT be called
			expect(mockSendRBTC).not.toHaveBeenCalled();
		});

		it('executes USDT ERC-20 transfer via connected wallet', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopUSDT();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(
				route,
				'usdt-bsc',
				dest,
				VALID_AMOUNT,
				CONNECTED_WALLET_ID
			);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashCONNECTEDWALLETabcdef1234567890');
			expect(mockGetBSCUSDTContractAddress).toHaveBeenCalled();
			expect(mockEncodeERC20Transfer).toHaveBeenCalled();
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledTimes(1);
			const txArg = mockEvmSigner.sendTransaction.mock.calls[0][0] as EVMTransactionRequest;
			expect(txArg.to).toBe(mockGetBSCUSDTContractAddress());
			expect(txArg.chainId).toBe(56);
			expect(txArg.data).toBeDefined();
			expect(mockSendBSCUSDT).not.toHaveBeenCalled();
		});

		it('returns FAILED when evmSigner is missing for connected wallet', async () => {
			// Arrange: use a wallet ID that has no signer
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, 'nonexistent-wallet');

			// Assert
			assertFailed(result, 'Connected wallet EVM signer not available');
		});

		it('returns FAILED for unsupported asset via connected wallet', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopUnsupported(); // DOC is not RBTC or USDT
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			assertFailed(result, 'Unsupported asset for connected wallet transfer');
		});

		it('regression: built-in wallet RBTC transfer still works without connected wallet', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, null);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashBUILTINrbtc');
			expect(mockSendRBTC).toHaveBeenCalledWith(DEST_ADDR, VALID_AMOUNT);
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
		});

		it('regression: built-in wallet USDT transfer still works without connected wallet', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopUSDT();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'usdt-bsc', dest, VALID_AMOUNT, null);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashBUILTINusdtbsc');
			expect(mockSendBSCUSDT).toHaveBeenCalledWith(DEST_ADDR, VALID_AMOUNT);
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// LI.FI Hop
	// =========================================================================

	describe('LI.FI Hop — Connected Wallet', () => {
		it('resolves address from connected wallet handle and signs via evmSigner', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeLifiHop('rsk', 'arbitrum');
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashCONNECTEDWALLETabcdef1234567890');
			// Verify LI.FI was called with the connected wallet address
			expect(mockLifiGetStepTransaction).toHaveBeenCalledTimes(1);
			const lifiCall = mockLifiGetStepTransaction.mock.calls[0][0] as Record<string, unknown>;
			expect(lifiCall.fromAddress).toBe('0xAAaA000000000000000000000000000000000001');
			// Verify evmSigner was used for signing
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledTimes(1);
			expect(mockSendRawTransaction).not.toHaveBeenCalled();
			expect(mockSendArbitrumTransaction).not.toHaveBeenCalled();
		});

		it('returns FAILED when evmSigner is missing for LI.FI connected wallet', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeLifiHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, 'nonexistent-wallet');

			// Assert
			assertFailed(result, 'Connected wallet EVM signer not available');
		});

		it('regression: built-in wallet uses sendRawTransaction for RSK LI.FI', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeLifiHop('rsk', 'bsc');
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, null);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashBUILTINraw');
			expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// Symbiosis Hop
	// =========================================================================

	describe('Symbiosis Hop — Connected Wallet', () => {
		it('resolves address from connected wallet handle and signs via evmSigner', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeSymbiosisHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashCONNECTEDWALLETabcdef1234567890');
			// Verify Symbiosis was called with connected wallet address
			expect(mockSymbiosisGetQuote).toHaveBeenCalledTimes(1);
			const symCall = mockSymbiosisGetQuote.mock.calls[0][0] as Record<string, unknown>;
			expect(symCall.from).toBe(mockHandle.address);
			// Verify evmSigner was used
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledTimes(1);
			expect(mockSendRawTransaction).not.toHaveBeenCalled();
		});

		it('falls back to built-in wallet when connected wallet address is missing for Symbiosis', async () => {
			// Arrange — 'nonexistent-wallet' has no handle, so getHandle returns undefined.
			// The code now falls back to the built-in wallet address instead of failing.
			const dest = makeDestination(DEST_ADDR);
			const hop = makeSymbiosisHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, 'nonexistent-wallet');

			// Assert — should succeed (uses built-in wallet address as fallback)
			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
		});

		it('regression: built-in wallet uses sendRawTransaction for Symbiosis', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeSymbiosisHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, null);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashBUILTINraw');
			expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// Boltz Hop — Submarine Swap (RBTC → Lightning)
	// =========================================================================

	describe('Boltz Hop — Submarine Swap (RBTC→LN)', () => {
		it('sends lockup via evmSigner when connected wallet is active', async () => {
			// Arrange
			const invoice = 'lnbc10n1mockinvoice';
			const dest = makeInvoiceDest(invoice);
			const hop = makeBoltzSubmarineHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashCONNECTEDWALLETabcdef1234567890');
			expect(mockCreateSubmarineSwap).toHaveBeenCalledWith(invoice);
			expect(mockLockSubmarineSwapFunds).not.toHaveBeenCalled();
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledTimes(1);
			const txArg = mockEvmSigner.sendTransaction.mock.calls[0][0] as EVMTransactionRequest;
			expect(txArg.to).toBe('0x5555000000000000000000000000000000000eee');
			expect(txArg.chainId).toBe(30);
		});

		it('returns FAILED when evmSigner is missing for submarine swap', async () => {
			// Arrange
			const dest = makeInvoiceDest('lnbc10n1mock');
			const hop = makeBoltzSubmarineHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, 'nonexistent-wallet');

			// Assert
			assertFailed(result, 'Connected wallet EVM signer not available');
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
		});

		it('returns FAILED when lockup address cannot be extracted from swapData', async () => {
			// Arrange: submarine swap returns data without a usable lockup address
			mockCreateSubmarineSwap.mockResolvedValueOnce({
				swapId: 'sub-swap-nolockup',
				invoice: 'lnbc10n1',
				swapData: { someField: 123 } // No lockupAddress, address, or lockupDetails
			});
			const dest = makeInvoiceDest('lnbc10n1');
			const hop = makeBoltzSubmarineHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			assertFailed(result, 'Could not extract lockup address from swap data');
		});

		it('regression: built-in wallet uses lockSubmarineSwapFunds', async () => {
			// Arrange
			const dest = makeInvoiceDest('lnbc10n1mock');
			const hop = makeBoltzSubmarineHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, null);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashBUILTINlockup');
			expect(mockLockSubmarineSwapFunds).toHaveBeenCalledTimes(1);
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// Boltz Hop — Chain Swap (RBTC → BTC)
	// =========================================================================

	describe('Boltz Hop — Chain Swap (RBTC→BTC)', () => {
		it('creates swap via BoltzProvider and locks via evmSigner', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeBoltzChainBtcHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, '0.001', CONNECTED_WALLET_ID);

			// Assert
			assertCompleted(result, 'COMPLETE', 'chain-swap-1');
			expect(mockBoltzCreateSwap).toHaveBeenCalledTimes(1);
			const boltzCall = mockBoltzCreateSwap.mock.calls[0][0] as Record<string, unknown>;
			expect(boltzCall.amountSats).toBe(100000);
			expect((boltzCall.claimAddress as string).toLowerCase()).toBe(
				mockHandle.address.toLowerCase()
			);
			// Verify lockup via evmSigner
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledTimes(1);
			const txArg = mockEvmSigner.sendTransaction.mock.calls[0][0] as EVMTransactionRequest;
			expect(txArg.to).toBe('0x4444000000000000000000000000000000000DDd');
			expect(txArg.chainId).toBe(30);
			// Built-in path must NOT be called
			expect(mockCreateChainSwap).not.toHaveBeenCalled();
		});

		it('returns FAILED when evmSigner is missing for chain swap', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeBoltzChainBtcHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, '0.001', 'nonexistent-wallet');

			// Assert
			assertFailed(result, 'Connected wallet EVM signer not available');
		});

		it('regression: built-in wallet uses createChainSwap for RBTC→BTC', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeBoltzChainBtcHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, '0.001', null);

			// Assert
			assertCompleted(result, 'COMPLETE', 'builtin-chain-swap-1');
			expect(mockCreateChainSwap).toHaveBeenCalledWith(100000);
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// Boltz Hop — Chain Swap (RBTC → Arbitrum)
	// =========================================================================

	describe('Boltz Hop — Chain Swap (RBTC→Arbitrum)', () => {
		it('creates swap via BoltzProvider and locks via evmSigner', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeBoltzChainArbHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, '0.01', CONNECTED_WALLET_ID);

			// Assert — if FAILED, surface the error for debugging
			if (result.data?.phase === 'FAILED') {
				throw new Error(`Swap chain failed unexpectedly: ${result.data?.error}`);
			}
			assertCompleted(result, 'COMPLETE', 'chain-swap-1');
			expect(mockBoltzCreateSwap).toHaveBeenCalledTimes(1);
			// Verify lockup via evmSigner on RSK chain (30) — lockup sends rBTC, Boltz handles Arb claim
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledTimes(1);
			const txArg = mockEvmSigner.sendTransaction.mock.calls[0][0] as EVMTransactionRequest;
			expect(txArg.to).toBe('0x4444000000000000000000000000000000000DDd');
			expect(txArg.chainId).toBe(30);
			// Built-in path must NOT be called
			expect(mockSendRawTransaction).not.toHaveBeenCalled();
		});

		it('returns FAILED when wallet handle not found for RBTC→Arb', async () => {
			// Arrange: nonexistent wallet — getHandle returns undefined, so arbAddr is empty
			const dest = makeDestination(DEST_ADDR);
			const hop = makeBoltzChainArbHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, '0.01', 'nonexistent-wallet');

			// Assert: the arbAddr resolution fails before the evmSigner check, since
			// getHandle(nonexistent) returns undefined and the address is empty.
			assertFailed(result, 'No Arbitrum wallet address available');
		});

		it('regression: built-in wallet uses sendRawTransaction for RBTC→Arb', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeBoltzChainArbHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, '0.01', null);

			// Assert — if FAILED, surface the error for debugging
			if (result.data?.phase === 'FAILED') {
				throw new Error(`Swap chain failed unexpectedly: ${result.data?.error}`);
			}
			assertCompleted(result, 'COMPLETE', 'chain-swap-1');
			expect(mockSendRawTransaction).toHaveBeenCalledTimes(1);
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// Changelly Hop — Connected Wallet Intermediate Address Resolution
	// =========================================================================

	describe('Changelly Hop — Connected Wallet', () => {
		it('resolves intermediate hop address from connected wallet handle', async () => {
			// Arrange: multi-hop route where Changelly is NOT the last hop
			const dest = makeDestination(DEST_ADDR);
			const changellyHop = makeChangellyHop('USDT', 'RBTC', 'rsk');
			const directHop = makeDirectHopRBTC();
			const route = makeRoute([changellyHop, directHop], 'multi-hop-route');

			// Act
			const _result = await startSwapChain(
				route,
				'usdt-bsc',
				dest,
				VALID_AMOUNT,
				CONNECTED_WALLET_ID
			);

			// Assert: Changelly createSwap should be called with the handle's address
			// (since it's an intermediate hop, not the final destination)
			expect(mockChangellyCreateSwap).toHaveBeenCalledTimes(1);
			const changellyArgs = mockChangellyCreateSwap.mock.calls[0][0] as Record<string, unknown>;
			expect(changellyArgs.address).toBe(mockHandle.address);
		});

		it('uses destination address for the last Changelly hop', async () => {
			// Arrange: Changelly is the last (only) hop
			const dest = makeDestination(DEST_ADDR);
			const hop = makeChangellyHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(
				route,
				'usdt-bsc',
				dest,
				VALID_AMOUNT,
				CONNECTED_WALLET_ID
			);

			// Assert: final destination address should be used
			assertCompleted(result, 'COMPLETE', 'changelly-swap-123');
			expect(mockChangellyCreateSwap).toHaveBeenCalledTimes(1);
			const changellyArgs = mockChangellyCreateSwap.mock.calls[0][0] as Record<string, unknown>;
			expect(changellyArgs.address).toBe(DEST_ADDR);
		});
	});

	// =========================================================================
	// Amount Validation
	// =========================================================================

	describe('Amount Validation', () => {
		it('returns error for NaN amount', async () => {
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			const result = await startSwapChain(route, 'rbtc', dest, 'not-a-number', CONNECTED_WALLET_ID);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toContain('Invalid amount');
		});

		it('returns error for negative amount', async () => {
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			const result = await startSwapChain(route, 'rbtc', dest, '-1.5', CONNECTED_WALLET_ID);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toContain('must be greater than zero');
		});

		it('returns error for zero amount', async () => {
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			const result = await startSwapChain(route, 'rbtc', dest, '0', CONNECTED_WALLET_ID);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toContain('must be greater than zero');
		});

		it('returns error for amount exceeding maximum', async () => {
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			const result = await startSwapChain(route, 'rbtc', dest, '2000000000', CONNECTED_WALLET_ID);

			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toContain('exceeds maximum allowed');
		});
	});

	// =========================================================================
	// Error Propagation — Signer Failures
	// =========================================================================

	describe('Error Propagation', () => {
		it('returns FAILED state when evmSigner.sendTransaction rejects', async () => {
			// Arrange
			mockEvmSigner.sendTransaction.mockRejectedValueOnce(
				new Error('User rejected the transaction')
			);
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			assertFailed(result, 'User rejected the transaction');
		});

		it('returns FAILED state when LI.FI service fails', async () => {
			// Arrange
			mockLifiGetStepTransaction.mockRejectedValueOnce(new Error('LI.FI API error'));
			const dest = makeDestination(DEST_ADDR);
			const hop = makeLifiHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			assertFailed(result, 'LI.FI API error');
		});

		it('returns FAILED state when Symbiosis service fails', async () => {
			// Arrange
			mockSymbiosisGetQuote.mockRejectedValueOnce(new Error('Symbiosis API down'));
			const dest = makeDestination(DEST_ADDR);
			const hop = makeSymbiosisHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			assertFailed(result, 'Symbiosis API down');
		});

		it('returns FAILED state when Changelly createSwap fails', async () => {
			// Arrange
			mockChangellyCreateSwap.mockRejectedValueOnce(new Error('Changelly: invalid pair'));
			const dest = makeDestination(DEST_ADDR);
			const hop = makeChangellyHop();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(
				route,
				'usdt-bsc',
				dest,
				VALID_AMOUNT,
				CONNECTED_WALLET_ID
			);

			// Assert
			assertFailed(result, 'Changelly: invalid pair');
		});
	});

	// =========================================================================
	// Edge Cases
	// =========================================================================

	describe('Edge Cases', () => {
		it('handles very small decimal amounts correctly', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			// Act
			const result = await startSwapChain(
				route,
				'rbtc',
				dest,
				'0.000000000000000001',
				CONNECTED_WALLET_ID
			);

			// Assert
			assertCompleted(result, 'COMPLETE', '0xtxhashCONNECTEDWALLETabcdef1234567890');
			expect(mockEvmSigner.sendTransaction).toHaveBeenCalledTimes(1);
			// Amount in wei should be 1
			const txArg = mockEvmSigner.sendTransaction.mock.calls[0][0] as EVMTransactionRequest;
			expect(txArg.value).toBe(1n);
		});

		it('handles route with no hops gracefully', async () => {
			// Arrange
			const dest = makeDestination(DEST_ADDR);
			const route: Route = {
				id: 'empty-route',
				label: 'Empty',
				hops: [],
				totalFeePercent: 0,
				estimatedTime: '0 min',
				recommended: false
			};

			// Act
			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, CONNECTED_WALLET_ID);

			// Assert
			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toContain('Route has no hops');
		});

		it('sourceConnectedWalletId=null routes through built-in wallet (all hop types)', async () => {
			// Test that setting null explicitly uses the built-in wallet path
			const dest = makeDestination(DEST_ADDR);
			const hop = makeDirectHopRBTC();
			const route = makeRoute([hop]);

			const result = await startSwapChain(route, 'rbtc', dest, VALID_AMOUNT, null);

			assertCompleted(result, 'COMPLETE', '0xtxhashBUILTINrbtc');
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
		});
	});

	// =========================================================================
	// resumeSwapChain
	// =========================================================================

	describe('resumeSwapChain', () => {
		/** Build a SwapChainState JSON string for mocking Preferences.get. */
		function makePersistedState(
			phase: SwapChainPhase,
			overrides: Partial<SwapChainState> = {}
		): string {
			return JSON.stringify({
				phase,
				route: overrides.route ?? null,
				sourceWallet: overrides.sourceWallet ?? null,
				destination: overrides.destination ?? null,
				sourceConnectedWalletId: overrides.sourceConnectedWalletId ?? null,
				amount: overrides.amount ?? null,
				swap1Id: overrides.swap1Id ?? null,
				swap2Id: overrides.swap2Id ?? null,
				swap1Details: overrides.swap1Details ?? null,
				swap2Details: overrides.swap2Details ?? null,
				error: overrides.error ?? null,
				updatedAt: overrides.updatedAt ?? Date.now()
			});
		}

		it('returns COMPLETE state without re-executing hops', async () => {
			// Arrange: mock Preferences to return a completed state
			mockPreferencesGet.mockResolvedValue({
				value: makePersistedState('COMPLETE', {
					swap1Id: '0xtxhash1',
					route: makeRoute([makeDirectHopRBTC()])
				})
			});

			// Act
			const result = await resumeSwapChain();

			// Assert
			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.phase).toBe('COMPLETE');
			// No hop executors should be called
			expect(mockEvmSigner.sendTransaction).not.toHaveBeenCalled();
			expect(mockSendRBTC).not.toHaveBeenCalled();
		});

		it('returns FAILED state without re-executing hops', async () => {
			// Arrange
			mockPreferencesGet.mockResolvedValue({
				value: makePersistedState('FAILED', { error: 'User rejected' })
			});

			// Act
			const result = await resumeSwapChain();

			// Assert
			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.phase).toBe('FAILED');
			expect(result.data!.error).toBe('User rejected');
		});

		it('returns PARTIAL state without re-executing hops', async () => {
			// Arrange
			mockPreferencesGet.mockResolvedValue({
				value: makePersistedState('PARTIAL', {
					swap1Id: '0xtxhash1',
					error: 'Hop 2 failed'
				})
			});

			// Act
			const result = await resumeSwapChain();

			// Assert
			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.phase).toBe('PARTIAL');
			expect(result.data!.error).toBe('Hop 2 failed');
		});

		it('returns IDLE state without doing anything', async () => {
			// Arrange: no persisted state → defaults to INITIAL (IDLE)
			mockPreferencesGet.mockResolvedValue({ value: null });

			// Act
			const result = await resumeSwapChain();

			// Assert
			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			expect(result.data!.phase).toBe('IDLE');
		});

		it('returns error when device is offline', async () => {
			// Arrange: simulate offline
			const originalOnLine = navigator.onLine;
			Object.defineProperty(navigator, 'onLine', {
				value: false,
				writable: true,
				configurable: true
			});

			// Act
			const result = await resumeSwapChain();

			// Assert
			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toContain('offline');

			// Cleanup
			Object.defineProperty(navigator, 'onLine', {
				value: originalOnLine,
				writable: true,
				configurable: true
			});
		});

		it('blocks concurrent resume calls', async () => {
			// Arrange: make Preferences.get hang so the first call holds the lock
			let resolvePreferencesGet!: (v: { value: string | null }) => void;
			mockPreferencesGet.mockReturnValue(
				new Promise<{ value: string | null }>((resolve) => {
					resolvePreferencesGet = resolve;
				})
			);

			// Act: start first resume (will hang on loadSwapChainState)
			const firstCallPromise = resumeSwapChain();

			// Give the first call time to acquire the lock
			await new Promise((r) => setTimeout(r, 5));

			// Act: try a second resume while the first is still running
			const result = await resumeSwapChain();

			// Assert: second call is blocked
			expect(result.data).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error!.message).toContain('swap is already in progress');

			// Cleanup: release the first call
			resolvePreferencesGet({ value: makePersistedState('IDLE') });
			await firstCallPromise;
		});
	});
});

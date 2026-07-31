/**
 * Swap Chain — Boltz Executor Behavioral Tests
 *
 * Tests the executeBoltzHop dispatcher, prepareChainSwap, claimSwapFunds,
 * storeBoltzSwapData, and the executeRbtcToArbitrumSwap integration flow.
 * Mocks only external I/O (Boltz API, EVM transactions, wallet stores,
 * persistence). Tests real executor and setup logic.
 *
 * Pattern: setup-preflight.behavioral.test.ts — mock external I/O, test internals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock external I/O ──────────────────────────────────────────────────

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('$lib/services/swap-chain/tx-helpers', () => ({
	sendEvmTransaction: vi.fn().mockResolvedValue({ data: '0xLockupTxHash', error: null }),
	resolveUserAddress: vi.fn().mockReturnValue('0x90F79bf6EB2c4f870365E785982E1f101E93b906'),
	queryERC20Balance: vi.fn().mockResolvedValue(5000000000000000000n),
	waitForERC20Balance: vi.fn().mockResolvedValue(5000000000000000000n)
}));

vi.mock('$lib/stores/wallet.store', () => {
	const { writable } = require('svelte/store');
	const store = writable({
		rsk: { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' },
		arb: { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' }
	});
	return {
		walletStore: { subscribe: store.subscribe, set: store.set, update: store.update },
		createSubmarineSwap: vi.fn().mockResolvedValue({
			swapData: {
				lockupAddress: '0xSubmarineLockupAddr',
				expectedAmount: 100000
			}
		}),
		lockSubmarineSwapFunds: vi.fn().mockResolvedValue({ txHash: '0xSubmarineTxHash' }),
		createChainSwap: vi.fn().mockResolvedValue({ swapId: 'chain-swap-id' }),
		sendRawTransaction: vi.fn(),
		sendArbitrumTransaction: vi.fn()
	};
});

vi.mock('$lib/stores/connected-wallets.store', () => ({
	getHandle: vi.fn(() => ({ address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' })),
	getEvmSigner: vi.fn(),
	getBitcoinSigner: vi.fn(),
	hasBitcoinSigner: vi.fn(() => false),
	getBitcoinAddress: vi.fn(() => null)
}));

vi.mock('$lib/utils/swap-preimage', () => ({
	generateSwapPreimage: vi.fn().mockResolvedValue({
		preimageHex: 'aabbccddee',
		hashHex: '1122334455667788aabbccddee1122334455667788aabbccddee1122334455667788'
	})
}));

vi.mock('$lib/services/BoltzProvider', () => ({
	boltzProvider: {
		createSwap: vi.fn().mockResolvedValue({
			swapId: 'boltz-swap-123',
			lockupAddress: '0xe761e1354097757c019855637746e7dd1bef1654',
			expectedAmount: 5000,
			timeoutBlockHeight: 800000,
			claimAddress: '0xClaimAddr',
			lockupClaimAddress: '0x7a2A2e8aD3b31B9B8Ff2D8384f2B4873B3e19f5C',
			claimDetails: {
				lockupAddress: '0xBoltzLockupOnArbitrum',
				amount: 5000,
				refundAddress: '0xRefundAddr',
				timeoutBlockHeight: 800000
			}
		}),
		getQuote: vi.fn()
	}
}));

vi.mock('$lib/services/swap-chain/abi', () => ({
	encodeEtherSwapLock: vi.fn().mockReturnValue('0xEtherSwapLockCalldata'),
	encodeEtherSwapClaim: vi.fn().mockReturnValue('0xEtherSwapClaimCalldata'),
	encodeERC20SwapLock: vi.fn().mockReturnValue('0xERC20LockCalldata'),
	encodeERC20SwapClaim: vi.fn().mockReturnValue('0xERC20ClaimCalldata'),
	encodeERC20Approve: vi.fn().mockReturnValue('0xERC20ApproveCalldata'),
	encodeERC20Transfer: vi.fn().mockReturnValue('0xERC20TransferCalldata'),
	encodeERC20SwapLockPrepay: vi.fn().mockReturnValue('0xERC20LockPrepayCalldata'),
	encodeERC20SwapClaimWithSig: vi.fn().mockReturnValue('0xERC20ClaimWithSigCalldata'),
	encodeEtherSwapRefund: vi.fn().mockReturnValue('0xEtherSwapRefundCalldata'),
	buildExecuteBatchCallData: vi.fn().mockReturnValue('0xBatchCalldata')
}));

vi.mock('$lib/services/swap-chain/persistence', () => ({
	swapClaimData: new Map(),
	swapRefundData: new Map(),
	persistClaimData: vi.fn().mockResolvedValue(undefined),
	persistRefundData: vi.fn().mockResolvedValue(undefined),
	saveClaimDataToNostr: vi.fn().mockResolvedValue(undefined),
	loadPersistedClaimData: vi.fn().mockResolvedValue(undefined),
	loadPersistedRefundData: vi.fn().mockResolvedValue(undefined),
	loadClaimDataFromNostr: vi.fn().mockResolvedValue(null)
}));

vi.mock('$lib/services/swap-chain/state', async () => {
	const actual = await vi.importActual('$lib/services/swap-chain/state');
	return {
		...actual,
		setSwapProgress: vi.fn()
	};
});

vi.mock('$lib/services/swap-chain/utils', () => ({
	TBTC_ARB: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40',
	ETHERSWAP_ADDRESS: '0xe761e1354097757c019855637746e7dd1bef1654',
	WBTC_ARB: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
	estimateRskGas: vi.fn().mockResolvedValue(150000),
	RSK_RPC_URL: 'https://mainnet.sovryn.app/rpc',
	GAS_LIMIT_RSK: 150_000,
	GAS_LIMIT_RSK_MAX: 500_000,
	GAS_LIMIT_RSK_CLAIM: 150_000,
	GAS_LIMIT_RSK_DEFAULT: 150_000,
	GAS_LIMIT_RSK_MIN: 100_000,
	CHAIN_ID_RSK: 30,
	CHAIN_ID_ARB: 42161,
	CHAIN_ID_BSC: 56,
	NATIVE_TOKEN: '0x0000000000000000000000000000000000000000',
	USDT0_ARB_ADDR: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
	USDT_BSC: '0x55d398326f99059fF775485246999027B3197955',
	BLOCKSCOUT_API_BASE: 'https://rootstock.blockscout.com/api',
	BOLTZ_MAX_WAIT_MS: 1_800_000,
	CHANGELLY_MAX_WAIT_MS: 600_000,
	RSK_BLOCK_TIME_SECONDS: 30,
	LOCKUP_TOPIC: '0x15b4b8206809535e547317cd5cedc86cff6e7d203551f93701786ddaf14fd9f9',
	CLAIM_TOPIC: '0x5664142af3dcfc3dc3de45a43f75c746bd1d8c11170a5037fdf98bdb35775137',
	resolveChainId: vi.fn().mockReturnValue(30),
	resolveTokenAddress: vi.fn().mockReturnValue('0x0000000000000000000000000000000000000000'),
	LIFI_ASSET_DECIMALS: {},
	getSymbiosisDecimals: vi.fn().mockReturnValue(18)
}));

vi.mock('$lib/utils/swap-gas', () => ({
	fetchGasPrice: vi.fn().mockResolvedValue(26_000_000n)
}));

vi.mock('ethers', () => ({
	ethers: {
		getAddress: (addr: string) => {
			const clean = addr.trim().toLowerCase();
			if (!/^0x[0-9a-f]{40}$/.test(clean)) {
				throw new Error(`invalid address: ${addr}`);
			}
			return clean;
		},
		Wallet: {
			createRandom: () => ({
				publicKey: '0x04' + 'ab'.repeat(64)
			})
		}
	}
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined)
	}
}));

// ── Imports (real modules under test) ──────────────────────────────────

import { executeBoltzHop } from '$lib/services/swap-chain/boltz/executors';
import { prepareChainSwap, claimSwapFunds, storeBoltzSwapData } from '$lib/services/swap-chain/boltz/setup';
import type { SwapSetupResult } from '$lib/services/swap-chain/boltz/setup';
import { boltzProvider } from '$lib/services/BoltzProvider';
import { sendEvmTransaction, waitForERC20Balance, resolveUserAddress } from '$lib/services/swap-chain/tx-helpers';
import { createSubmarineSwap } from '$lib/stores/wallet.store';
import { getHandle } from '$lib/stores/connected-wallets.store';
import { generateSwapPreimage } from '$lib/utils/swap-preimage';
import {
	swapClaimData,
	swapRefundData,
	persistClaimData,
	persistRefundData,
	saveClaimDataToNostr
} from '$lib/services/swap-chain/persistence';
import type { SwapChainState } from '$lib/services/swap-chain/state';
import type { RouteHop } from '$lib/services/route-resolver';

// ── Test constants ─────────────────────────────────────────────────────

const MOCK_RSK_ADDR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const MOCK_ARB_ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const BOLTZ_LOCKUP_ADDR = '0xe761e1354097757c019855637746e7dd1bef1654';
const BOLTZ_CLAIM_ADDR = '0x7a2A2e8aD3b31B9B8Ff2D8384f2B4873B3e19f5C';

// ── Helpers ────────────────────────────────────────────────────────────

function createTestState(overrides?: Partial<SwapChainState>): SwapChainState {
	return {
		phase: 'SWAP_1_PENDING',
		route: null,
		sourceWallet: null,
		destination: null,
		sourceConnectedWalletId: 'wallet-123',
		amount: '0.0005',
		adjustedAmount: null,
		relayFeeBuffer: null,
		swap1Id: null,
		swap2Id: null,
		swap1Details: null,
		swap2Details: null,
		error: null,
		updatedAt: Date.now(),
		...overrides
	};
}

function createHop(overrides?: Partial<RouteHop>): RouteHop {
	return {
		service: 'boltz',
		fromAsset: 'RBTC',
		fromChain: 'rsk',
		toAsset: 'tBTC',
		toChain: 'arbitrum',
		feePercent: 0.25,
		estimatedTimeMin: 5,
		estimatedTimeMax: 15,
		...overrides
	};
}

function createMockSwapResult(overrides?: Partial<SwapSetupResult>): SwapSetupResult {
	return {
		amountSats: 5000,
		preimageHex: 'aabbccddee',
		hashHex: '1122334455667788aabbccddee1122334455667788aabbccddee1122334455667788',
		swapResult: {
			swapId: 'boltz-swap-123',
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			expectedAmount: 5000,
			timeoutBlockHeight: 800000,
			claimAddress: '0xClaimAddr',
			lockupClaimAddress: BOLTZ_CLAIM_ADDR,
			claimDetails: {
				lockupAddress: '0xBoltzLockupOnArbitrum',
				amount: 5000,
				refundAddress: '0xRefundAddr',
				timeoutBlockHeight: 800000
			}
		},
		...overrides
	} as SwapSetupResult;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('executeBoltzHop — dispatcher routing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(sendEvmTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: '0xLockupTxHash',
			error: null
		});
		(waitForERC20Balance as ReturnType<typeof vi.fn>).mockResolvedValue(5000000000000000000n);
		(getHandle as ReturnType<typeof vi.fn>).mockReturnValue({ address: MOCK_ARB_ADDR });

		globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: { body?: string }) => {
			const body = opts?.body ? JSON.parse(opts.body) : {};
			const method = body.method as string;
			const ok = (result: string) => ({ ok: true, status: 200, json: () => Promise.resolve({ result }) });
			if (method === 'eth_getBalance') return Promise.resolve(ok('0x' + (100000n * 10_000_000_000n).toString(16)));
			if (method === 'eth_gasPrice') return Promise.resolve(ok('0x18daac0'));
			if (method === 'eth_estimateGas') return Promise.resolve(ok('0x1e848'));
			return Promise.resolve(ok('0x0'));
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('routes RBTC → arbitrum to executeRbtcToArbitrumSwap', async () => {
		const hop = createHop({ fromAsset: 'RBTC', toChain: 'arbitrum', toAsset: 'tBTC' });
		const state = createTestState();

		const result = await executeBoltzHop(hop, state);

		expect(result.error).toBeNull();
		expect(result.data).toBe('boltz-swap-123');
		expect(getHandle).toHaveBeenCalledWith('wallet-123');
		expect(boltzProvider.createSwap).toHaveBeenCalledTimes(1);
		expect(sendEvmTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ chain: 'rsk', to: BOLTZ_LOCKUP_ADDR })
		);
	});

	it('routes RBTC → bitcoin to executeRbtcToBtcSwap', async () => {
		const hop = createHop({ fromAsset: 'RBTC', toChain: 'bitcoin', toAsset: 'BTC' });
		const state = createTestState();

		const result = await executeBoltzHop(hop, state);

		expect(result.error).toBeNull();
		expect(result.data).toBe('boltz-swap-123');
		expect(resolveUserAddress).toHaveBeenCalledWith(state, 'BTC');
		expect(boltzProvider.createSwap).toHaveBeenCalledTimes(1);
		expect(sendEvmTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ chain: 'rsk' })
		);
	});

	it('routes RBTC → lightning to executeRbtcToLightningSwap', async () => {
		const hop = createHop({ fromAsset: 'RBTC', toChain: 'lightning', toAsset: 'Lightning' });
		const state = createTestState({
			destination: { type: 'invoice', network: 'lightning', invoice: 'lnbc1234...' }
		});

		const result = await executeBoltzHop(hop, state);

		expect(result.error).toBeNull();
		expect(createSubmarineSwap).toHaveBeenCalledWith('lnbc1234...');
		expect(sendEvmTransaction).toHaveBeenCalledWith(
			expect.objectContaining({ chain: 'rsk', to: '0xSubmarineLockupAddr' })
		);
	});

	it('routes tBTC → rsk to executeTbtcToRbtcSwap', async () => {
		const hop = createHop({ fromAsset: 'tBTC', fromChain: 'arbitrum', toChain: 'rsk', toAsset: 'RBTC' });
		const state = createTestState();

		const result = await executeBoltzHop(hop, state);

		expect(result.error).toBeNull();
		expect(result.data).toBe('boltz-swap-123');
		expect(waitForERC20Balance).toHaveBeenCalledWith(
			'0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40',
			expect.any(String),
			expect.any(BigInt),
			'arbitrum',
			180_000
		);
		expect(boltzProvider.createSwap).toHaveBeenCalledWith(
			expect.objectContaining({ fromSymbol: 'TBTC', toSymbol: 'RBTC' })
		);
	});

	it('returns error for unknown from/to combination', async () => {
		const hop = createHop({ fromAsset: 'USDT', toChain: 'polygon', toAsset: 'MATIC' });
		const state = createTestState();

		const result = await executeBoltzHop(hop, state);

		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Unsupported Boltz swap');
		expect(result.error!.message).toContain('USDT');
		expect(result.error!.message).toContain('polygon');
		expect(boltzProvider.createSwap).not.toHaveBeenCalled();
		expect(sendEvmTransaction).not.toHaveBeenCalled();
	});
});

describe('prepareChainSwap', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(boltzProvider.createSwap as ReturnType<typeof vi.fn>).mockResolvedValue({
			swapId: 'boltz-swap-456',
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			expectedAmount: 5000,
			timeoutBlockHeight: 800000,
			claimAddress: '0xClaimAddr',
			lockupClaimAddress: BOLTZ_CLAIM_ADDR,
			claimDetails: {
				lockupAddress: '0xBoltzLockupOnArbitrum',
				amount: 5000,
				refundAddress: '0xRefundAddr',
				timeoutBlockHeight: 800000
			}
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns error when amount is null', async () => {
		const state = createTestState({ amount: null });
		const result = await prepareChainSwap(state, MOCK_ARB_ADDR);

		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toBe('Amount is required');
		expect(boltzProvider.createSwap).not.toHaveBeenCalled();
	});

	it('returns error when amount is empty string', async () => {
		const state = createTestState({ amount: '' });
		const result = await prepareChainSwap(state, MOCK_ARB_ADDR);

		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toBe('Amount is required');
	});

	it('returns error when parsed amount is zero', async () => {
		const state = createTestState({ amount: '0' });
		const result = await prepareChainSwap(state, MOCK_ARB_ADDR);

		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toBe('Invalid amount');
	});

	it('generates preimage and hash via generateSwapPreimage', async () => {
		const state = createTestState();
		await prepareChainSwap(state, MOCK_ARB_ADDR);

		expect(generateSwapPreimage).toHaveBeenCalledTimes(1);
	});

	it('creates Boltz swap with correct parameters', async () => {
		const state = createTestState({ amount: '0.0005' });
		await prepareChainSwap(state, MOCK_ARB_ADDR, 'RBTC', 'TBTC');

		expect(boltzProvider.createSwap).toHaveBeenCalledTimes(1);
		expect(boltzProvider.createSwap).toHaveBeenCalledWith(
			expect.objectContaining({
				amountSats: expect.any(Number),
				claimAddress: MOCK_ARB_ADDR,
				preimageHash: '1122334455667788aabbccddee1122334455667788aabbccddee1122334455667788',
				refundPublicKey: expect.any(String),
				fromSymbol: 'RBTC',
				toSymbol: 'TBTC'
			})
		);
	});

	it('persists claim and refund data via storeBoltzSwapData', async () => {
		const state = createTestState();
		await prepareChainSwap(state, MOCK_ARB_ADDR);

		expect(persistClaimData).toHaveBeenCalled();
		expect(persistRefundData).toHaveBeenCalled();
		expect(saveClaimDataToNostr).toHaveBeenCalledWith(
			'boltz-swap-456',
			expect.objectContaining({ preimageHex: 'aabbccddee' })
		);
	});

	it('stores refund data in the swapRefundData map', async () => {
		const state = createTestState();
		await prepareChainSwap(state, MOCK_ARB_ADDR);

		expect(swapRefundData.has('boltz-swap-456')).toBe(true);
		const refundEntry = swapRefundData.get('boltz-swap-456');
		expect(refundEntry).toEqual(
			expect.objectContaining({
				preimageHash: '1122334455667788aabbccddee1122334455667788aabbccddee1122334455667788',
				lockupAddress: BOLTZ_LOCKUP_ADDR,
				timeoutBlockHeight: 800000
			})
		);
	});

	it('stores claim data in the swapClaimData map when claimDetails present', async () => {
		const state = createTestState();
		await prepareChainSwap(state, MOCK_ARB_ADDR);

		expect(swapClaimData.has('boltz-swap-456')).toBe(true);
		const claimEntry = swapClaimData.get('boltz-swap-456');
		expect(claimEntry).toEqual(
			expect.objectContaining({
				preimageHex: 'aabbccddee',
				lockupClaimAddress: BOLTZ_CLAIM_ADDR
			})
		);
	});

	it('returns SwapSetupResult with all required fields', async () => {
		const state = createTestState({ amount: '0.001' });
		const result = await prepareChainSwap(state, MOCK_ARB_ADDR);

		expect(result.error).toBeNull();
		expect(result.data).not.toBeNull();
		expect(result.data!.amountSats).toBeGreaterThan(0);
		expect(result.data!.preimageHex).toBe('aabbccddee');
		expect(result.data!.hashHex).toBe(
			'1122334455667788aabbccddee1122334455667788aabbccddee1122334455667788'
		);
		expect(result.data!.swapResult).toEqual(
			expect.objectContaining({
				swapId: 'boltz-swap-456',
				lockupAddress: BOLTZ_LOCKUP_ADDR,
				timeoutBlockHeight: 800000
			})
		);
	});

	it('passes fromSymbol and toSymbol through to boltz.createSwap', async () => {
		const state = createTestState();
		await prepareChainSwap(state, MOCK_ARB_ADDR, 'RBTC', 'TBTC');

		expect(boltzProvider.createSwap).toHaveBeenCalledWith(
			expect.objectContaining({ fromSymbol: 'RBTC', toSymbol: 'TBTC' })
		);
	});

	it('omits fromSymbol/toSymbol when not provided', async () => {
		const state = createTestState();
		await prepareChainSwap(state, MOCK_ARB_ADDR);

		expect(boltzProvider.createSwap).toHaveBeenCalledWith(
			expect.objectContaining({ fromSymbol: undefined, toSymbol: undefined })
		);
	});
});

describe('claimSwapFunds', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(sendEvmTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: '0xClaimTxHash',
			error: null
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('calls sendEvmTransaction with correct params', async () => {
		const result = await claimSwapFunds({
			contractAddress: BOLTZ_LOCKUP_ADDR,
			chain: 'arbitrum',
			calldata: '0xClaimCalldata',
			sourceConnectedWalletId: 'wallet-123',
			logLabel: 'test-claim'
		});

		expect(result).toBeNull();
		expect(sendEvmTransaction).toHaveBeenCalledTimes(1);
		expect(sendEvmTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				to: BOLTZ_LOCKUP_ADDR,
				data: '0xClaimCalldata',
				value: 0n,
				chain: 'arbitrum',
				sourceConnectedWalletId: 'wallet-123'
			})
		);
	});

	it('returns null on success', async () => {
		const result = await claimSwapFunds({
			contractAddress: BOLTZ_LOCKUP_ADDR,
			chain: 'rsk',
			calldata: '0xCalldata',
			sourceConnectedWalletId: null,
			logLabel: 'rsk-claim'
		});

		expect(result).toBeNull();
	});

	it('returns error on sendEvmTransaction failure', async () => {
		(sendEvmTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: null,
			error: new Error('transaction reverted')
		});

		const result = await claimSwapFunds({
			contractAddress: BOLTZ_LOCKUP_ADDR,
			chain: 'rsk',
			calldata: '0xCalldata',
			sourceConnectedWalletId: null,
			logLabel: 'rsk-claim'
		});

		expect(result).not.toBeNull();
		expect(result).toBeInstanceOf(Error);
		expect(result!.message).toBe('transaction reverted');
	});

	it('returns error for invalid contract address', async () => {
		const result = await claimSwapFunds({
			contractAddress: 'not-a-valid-address',
			chain: 'arbitrum',
			calldata: '0xCalldata',
			sourceConnectedWalletId: null,
			logLabel: 'bad-claim'
		});

		expect(result).not.toBeNull();
		expect(result).toBeInstanceOf(Error);
		expect(result!.message).toContain('Invalid contract address');
		expect(result!.message).toContain('bad-claim');
		expect(sendEvmTransaction).not.toHaveBeenCalled();
	});

	it('passes gasLimit and feeToken to sendEvmTransaction', async () => {
		await claimSwapFunds({
			contractAddress: BOLTZ_LOCKUP_ADDR,
			chain: 'arbitrum',
			calldata: '0xCalldata',
			gasLimit: 300000,
			sourceConnectedWalletId: 'wallet-123',
			logLabel: 'arb-claim',
			feeToken: '0xUSDTAddr'
		});

		expect(sendEvmTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				gasLimit: 300000,
				feeToken: '0xUSDTAddr'
			})
		);
	});

	it('returns wrapped error when sendEvmTransaction throws', async () => {
		(sendEvmTransaction as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('network timeout')
		);

		const result = await claimSwapFunds({
			contractAddress: BOLTZ_LOCKUP_ADDR,
			chain: 'rsk',
			calldata: '0xCalldata',
			sourceConnectedWalletId: null,
			logLabel: 'timeout-claim'
		});

		expect(result).not.toBeNull();
		expect(result!.message).toBe('network timeout');
	});
});

describe('storeBoltzSwapData', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		swapClaimData.clear();
		swapRefundData.clear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('stores claim data in memory when claimDetails provided', async () => {
		await storeBoltzSwapData({
			swapId: 'swap-789',
			preimageHex: 'aabbcc',
			hashHex: 'ddeeff',
			claimDetails: {
				lockupAddress: '0xLockupAddr',
				amount: 5000,
				refundAddress: '0xRefundAddr',
				timeoutBlockHeight: 800000
			},
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			timeoutBlockHeight: 800000,
			claimAddress: BOLTZ_CLAIM_ADDR
		});

		expect(swapClaimData.has('swap-789')).toBe(true);
		expect(swapClaimData.get('swap-789')).toEqual({
			preimageHex: 'aabbcc',
			claimDetails: {
				lockupAddress: '0xLockupAddr',
				amount: 5000,
				refundAddress: '0xRefundAddr',
				timeoutBlockHeight: 800000
			},
			lockupClaimAddress: BOLTZ_CLAIM_ADDR
		});
	});

	it('stores refund data in memory', async () => {
		await storeBoltzSwapData({
			swapId: 'swap-789',
			preimageHex: 'aabbcc',
			hashHex: 'ddeeff',
			claimDetails: null,
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			timeoutBlockHeight: 800000,
			claimAddress: BOLTZ_CLAIM_ADDR
		});

		expect(swapRefundData.has('swap-789')).toBe(true);
		expect(swapRefundData.get('swap-789')).toEqual({
			preimageHash: 'ddeeff',
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			timeoutBlockHeight: 800000,
			claimAddress: BOLTZ_CLAIM_ADDR
		});
	});

	it('persists claim data to Preferences', async () => {
		await storeBoltzSwapData({
			swapId: 'swap-789',
			preimageHex: 'aabbcc',
			hashHex: 'ddeeff',
			claimDetails: {
				lockupAddress: '0xLockupAddr',
				amount: 5000,
				refundAddress: '0xRefundAddr',
				timeoutBlockHeight: 800000
			},
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			timeoutBlockHeight: 800000,
			claimAddress: BOLTZ_CLAIM_ADDR
		});

		expect(persistClaimData).toHaveBeenCalledTimes(1);
	});

	it('persists refund data to Preferences', async () => {
		await storeBoltzSwapData({
			swapId: 'swap-789',
			preimageHex: 'aabbcc',
			hashHex: 'ddeeff',
			claimDetails: null,
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			timeoutBlockHeight: 800000,
			claimAddress: BOLTZ_CLAIM_ADDR
		});

		expect(persistRefundData).toHaveBeenCalledTimes(1);
	});

	it('saves claim data to Nostr (best-effort)', async () => {
		await storeBoltzSwapData({
			swapId: 'swap-789',
			preimageHex: 'aabbcc',
			hashHex: 'ddeeff',
			claimDetails: {
				lockupAddress: '0xLockupAddr',
				amount: 5000,
				refundAddress: '0xRefundAddr',
				timeoutBlockHeight: 800000
			},
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			timeoutBlockHeight: 800000,
			claimAddress: BOLTZ_CLAIM_ADDR
		});

		expect(saveClaimDataToNostr).toHaveBeenCalledWith(
			'swap-789',
			expect.objectContaining({ preimageHex: 'aabbcc' })
		);
	});

	it('skips claim data storage when claimDetails is null', async () => {
		await storeBoltzSwapData({
			swapId: 'swap-no-claim',
			preimageHex: 'aabbcc',
			hashHex: 'ddeeff',
			claimDetails: null,
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			timeoutBlockHeight: 800000,
			claimAddress: BOLTZ_CLAIM_ADDR
		});

		expect(swapClaimData.has('swap-no-claim')).toBe(false);
		expect(persistClaimData).not.toHaveBeenCalled();
		expect(saveClaimDataToNostr).not.toHaveBeenCalled();
		expect(swapRefundData.has('swap-no-claim')).toBe(true);
		expect(persistRefundData).toHaveBeenCalledTimes(1);
	});

	it('does not throw when Nostr save fails (best-effort)', async () => {
		(saveClaimDataToNostr as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('Nostr relay down')
		);

		await expect(
			storeBoltzSwapData({
				swapId: 'swap-nostr-fail',
				preimageHex: 'aabbcc',
				hashHex: 'ddeeff',
				claimDetails: {
					lockupAddress: '0xLockupAddr',
					amount: 5000,
					refundAddress: '0xRefundAddr',
					timeoutBlockHeight: 800000
				},
				lockupAddress: BOLTZ_LOCKUP_ADDR,
				timeoutBlockHeight: 800000,
				claimAddress: BOLTZ_CLAIM_ADDR
			})
		).resolves.toBeUndefined();

		expect(swapClaimData.has('swap-nostr-fail')).toBe(true);
		expect(persistClaimData).toHaveBeenCalled();
	});
});

describe('Integration: executeRbtcToArbitrumSwap flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(sendEvmTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: '0xLockupTxHash',
			error: null
		});
		(getHandle as ReturnType<typeof vi.fn>).mockReturnValue({ address: MOCK_ARB_ADDR });
		(boltzProvider.createSwap as ReturnType<typeof vi.fn>).mockResolvedValue({
			swapId: 'integration-swap-001',
			lockupAddress: BOLTZ_LOCKUP_ADDR,
			expectedAmount: 5000,
			timeoutBlockHeight: 800000,
			claimAddress: '0xClaimAddr',
			lockupClaimAddress: BOLTZ_CLAIM_ADDR,
			claimDetails: {
				lockupAddress: '0xBoltzLockupOnArbitrum',
				amount: 5000,
				refundAddress: '0xRefundAddr',
				timeoutBlockHeight: 800000
			}
		});

		globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: { body?: string }) => {
			const body = opts?.body ? JSON.parse(opts.body) : {};
			const method = body.method as string;
			const ok = (result: string) => ({ ok: true, status: 200, json: () => Promise.resolve({ result }) });
			if (method === 'eth_getBalance') return Promise.resolve(ok('0x' + (100000n * 10_000_000_000n).toString(16)));
			if (method === 'eth_gasPrice') return Promise.resolve(ok('0x18daac0'));
			if (method === 'eth_estimateGas') return Promise.resolve(ok('0x1e848'));
			return Promise.resolve(ok('0x0'));
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('calls prepareChainSwap with correct state and arb address', async () => {
		const hop = createHop({ fromAsset: 'RBTC', toChain: 'arbitrum' });
		const state = createTestState({ amount: '0.0005', sourceConnectedWalletId: 'wallet-123' });

		await executeBoltzHop(hop, state);

		expect(getHandle).toHaveBeenCalledWith('wallet-123');
		expect(boltzProvider.createSwap).toHaveBeenCalledWith(
			expect.objectContaining({
				amountSats: expect.any(Number),
				claimAddress: expect.stringContaining(MOCK_ARB_ADDR.toLowerCase().slice(0, 10))
			})
		);
	});

	it('calls lockRskFunds with the setup result', async () => {
		const hop = createHop({ fromAsset: 'RBTC', toChain: 'arbitrum' });
		const state = createTestState({ sourceConnectedWalletId: 'wallet-123' });

		await executeBoltzHop(hop, state);

		expect(sendEvmTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				to: BOLTZ_LOCKUP_ADDR,
				chain: 'rsk',
				value: expect.any(BigInt),
				sourceConnectedWalletId: 'wallet-123'
			})
		);
	});

	it('returns the swap ID on success', async () => {
		const hop = createHop({ fromAsset: 'RBTC', toChain: 'arbitrum' });
		const state = createTestState();

		const result = await executeBoltzHop(hop, state);

		expect(result.error).toBeNull();
		expect(result.data).toBe('integration-swap-001');
	});

	it('returns error if prepareChainSwap fails', async () => {
		(boltzProvider.createSwap as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error('Boltz API unavailable')
		);

		const hop = createHop({ fromAsset: 'RBTC', toChain: 'arbitrum' });
		const state = createTestState();

		const result = await executeBoltzHop(hop, state);

		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Boltz API unavailable');
		expect(sendEvmTransaction).not.toHaveBeenCalled();
	});

	it('returns error if lockRskFunds fails', async () => {
		(sendEvmTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: null,
			error: new Error('transaction reverted: out of gas')
		});

		const hop = createHop({ fromAsset: 'RBTC', toChain: 'arbitrum' });
		const state = createTestState();

		const result = await executeBoltzHop(hop, state);

		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('transaction reverted: out of gas');
	});

	it('returns error when no Arbitrum wallet address is available', async () => {
		(getHandle as ReturnType<typeof vi.fn>).mockReturnValue(null);

		const hop = createHop({ fromAsset: 'RBTC', toChain: 'arbitrum' });
		const state = createTestState({ sourceConnectedWalletId: 'wallet-no-arb' });

		const result = await executeBoltzHop(hop, state);

		expect(result.data).toBeNull();
		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Arbitrum wallet address');
	});

	it('uses built-in wallet address when sourceConnectedWalletId is null', async () => {
		const hop = createHop({ fromAsset: 'RBTC', toChain: 'arbitrum' });
		const state = createTestState({ sourceConnectedWalletId: null });

		const result = await executeBoltzHop(hop, state);

		expect(result.error).toBeNull();
		expect(getHandle).not.toHaveBeenCalled();
		expect(boltzProvider.createSwap).toHaveBeenCalledTimes(1);
	});
});

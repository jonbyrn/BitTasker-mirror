/**
 * Swap Chain — RSK Pre-flight Balance Check Behavioral Tests
 *
 * Tests the full lockRskFunds pipeline: balance check → gas estimation →
 * insufficient funds detection → error propagation → sendEvmTransaction gate.
 * Mocks only external I/O (fetch/RPC calls, wallet stores, tx submission).
 * Tests the real lockRskFunds function and its internal processing flow.
 *
 * Pattern: meta-tx-relay/tests/gasless.test.js — mock external I/O, test internals.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock external I/O only ──────────────────────────────────────────────────

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

vi.mock('$lib/services/swap-chain/tx-helpers', () => ({
	sendEvmTransaction: vi.fn().mockResolvedValue({ data: '0xTxHash123', error: null })
}));

vi.mock('$lib/stores/wallet.store', () => {
	const { writable } = require('svelte/store');
	const store = writable({ rsk: { address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' } });
	return { walletStore: { subscribe: store.subscribe, set: store.set, update: store.update } };
});

vi.mock('$lib/stores/connected-wallets.store', () => ({
	getHandle: vi.fn(() => null),
	getEvmSigner: vi.fn(),
	getBitcoinSigner: vi.fn(),
	hasBitcoinSigner: vi.fn(() => false),
	getBitcoinAddress: vi.fn(() => null)
}));

// ── Imports (real module under test) ────────────────────────────────────────

import { lockRskFunds } from '$lib/services/swap-chain/boltz/setup';
import { sendEvmTransaction } from '$lib/services/swap-chain/tx-helpers';
import type { SwapSetupResult } from '$lib/services/swap-chain/boltz/setup';

// ── Test constants ──────────────────────────────────────────────────────────

const MOCK_WALLET_ADDR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const BOLTZ_CLAIM_ADDR = '0x7a2A2e8aD3b31B9B8Ff2D8384f2B4873B3e19f5C';
const LOCKUP_ADDR = '0xe761e1354097757c019855637746e7dd1bef1654';
const SatsToWei = 10_000_000_000n;

// ── Helpers ─────────────────────────────────────────────────────────────────

function createMockSetup(overrides?: Partial<SwapSetupResult>): SwapSetupResult {
	return {
		amountSats: 3267,
		preimageHex: 'aabbccdd',
		hashHex: '1122334455667788112233445566778811223344556677881122334455667788',
		swapResult: {
			swapId: 'test-swap-id',
			lockupAddress: LOCKUP_ADDR,
			lockupClaimAddress: BOLTZ_CLAIM_ADDR,
			claimAddress: MOCK_WALLET_ADDR,
			timeoutBlockHeight: 800000,
			claimDetails: null
		},
		...overrides
	} as SwapSetupResult;
}

/**
 * Build a globalThis.fetch mock that dispatches RPC calls by method name.
 * Each optional handler returns the raw result hex for its method.
 */
function mockRpcFetch(handlers: {
	getBalance?: string;
	gasPrice?: string;
	estimateGas?: string;
	getBalanceError?: Error;
	gasPriceError?: Error;
	estimateGasError?: Error;
}) {
	return vi.fn().mockImplementation((_url: string, opts?: { body?: string }) => {
		const body = opts?.body ? JSON.parse(opts.body) : {};
		const method = body.method as string;
		const ok = (result: string) => ({ ok: true, status: 200, json: () => Promise.resolve({ result }) });

		if (method === 'eth_getBalance') {
			if (handlers.getBalanceError) return Promise.reject(handlers.getBalanceError);
			return Promise.resolve(ok(handlers.getBalance ?? '0x0'));
		}
		if (method === 'eth_gasPrice') {
			if (handlers.gasPriceError) return Promise.reject(handlers.gasPriceError);
			return Promise.resolve(ok(handlers.gasPrice ?? '0x0'));
		}
		if (method === 'eth_estimateGas') {
			if (handlers.estimateGasError) return Promise.reject(handlers.estimateGasError);
			return Promise.resolve(ok(handlers.estimateGas ?? '0x0'));
		}

		return Promise.resolve(ok('0x0'));
	});
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('lockRskFunds — behavioral tests', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(sendEvmTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: '0xTxHash123',
			error: null
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('blocks swap when RBTC balance is insufficient (swap amount + gas)', async () => {
		// 3267 sats swap, balance = exactly 3267 sats (no gas margin)
		// Gas: eth_estimateGas returns 125000 → *1.2 = 150000 (clamped to GAS_LIMIT_RSK_MAX)
		// Gas cost: 150000 * 26061504 = 3,909,225,600,000 wei ≈ 390 sats
		// Total needed: 3267 + 390 = 3657 sats
		globalThis.fetch = mockRpcFetch({
			getBalance: '0x1db693beac00', // 3267 * 10^10 = 32,670,000,000,000
			gasPrice: '0x18daac0',        // 26,061,504
			estimateGas: '0x1e848'        // 125,000
		});

		const setup = createMockSetup({ amountSats: 3267 });
		const result = await lockRskFunds(setup, null);

		expect(result.error).not.toBeNull();
		expect(result.data).toBeNull();
		expect(result.error!.message).toContain('Insufficient RBTC for gas');
		expect(result.error!.message).toContain('swap 3267');
		expect(result.error!.message).toContain('Shortfall: 390 sats');
		expect(result.error!.message).toContain('have 3267 sats');
		expect(sendEvmTransaction).not.toHaveBeenCalled();
	});

	it('proceeds with swap when RBTC balance covers swap amount + gas', async () => {
		// 4000 sats available, ~3657 needed
		globalThis.fetch = mockRpcFetch({
			getBalance: '0x246139ca8000', // 4000 * 10^10 = 40,000,000,000,000
			gasPrice: '0x18daac0',        // 26,061,504
			estimateGas: '0x1e848'        // 125,000
		});

		const setup = createMockSetup({ amountSats: 3267 });
		const result = await lockRskFunds(setup, null);

		expect(result.error).toBeNull();
		expect(result.data).toBe('0xTxHash123');
		expect(sendEvmTransaction).toHaveBeenCalledTimes(1);
		expect(sendEvmTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				to: LOCKUP_ADDR,
				value: 3267n * SatsToWei,
				chain: 'rsk',
				sourceConnectedWalletId: null
			})
		);
	});

	it('proceeds when pre-flight balance check fails (RPC failure is non-blocking)', async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('RSK RPC timeout'));

		const setup = createMockSetup();
		const result = await lockRskFunds(setup, null);

		expect(sendEvmTransaction).toHaveBeenCalledTimes(1);
		expect(sendEvmTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				to: LOCKUP_ADDR,
				chain: 'rsk'
			})
		);
	});

	it('detects shortfall when gas price spikes (balance was sufficient at old price)', async () => {
		// 3500 sats balance — sufficient at normal gas price, insufficient at spike
		// Gas price spike: 200,000,000 wei (≈8x normal)
		// Gas cost: 150,000 * 200,000,000 = 30,000,000,000,000 wei = 3000 sats
		// Total: 3267 + 3000 = 6267 sats → shortfall = 6267 - 3500 = 2767 sats
		globalThis.fetch = mockRpcFetch({
			getBalance: '0x1fd512913000', // 3500 * 10^10 = 35,000,000,000,000
			gasPrice: '0xbebc200',        // 200,000,000
			estimateGas: '0x1e848'        // 125,000 → 150,000 with buffer
		});

		const setup = createMockSetup({ amountSats: 3267 });
		const result = await lockRskFunds(setup, null);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Insufficient RBTC for gas');
		expect(result.error!.message).toContain('swap 3267');
		expect(result.error!.message).toContain('Shortfall: 2767 sats');
		expect(sendEvmTransaction).not.toHaveBeenCalled();
	});

	it('applies 20% buffer to gas estimation (estimateRskGas adds buffer)', async () => {
		// eth_estimateGas returns 100000 → *1.2 = 120000
		// Gas cost: 120000 * 26061504 = 3,127,380,480,000 wei ≈ 312 sats
		// Total needed: 3267 + 312 = 3579 sats
		// Balance = 3267 sats → shortfall = 312 sats
		globalThis.fetch = mockRpcFetch({
			getBalance: '0x1db693beac00', // 3267 sats
			gasPrice: '0x18daac0',        // 26,061,504
			estimateGas: '0x186a0'        // 100,000
		});

		const setup = createMockSetup({ amountSats: 3267 });
		const result = await lockRskFunds(setup, null);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Insufficient RBTC for gas');
		expect(result.error!.message).toContain('Shortfall: 312 sats');

		// Verify the RPC call sent eth_estimateGas (confirms real estimateRskGas ran)
		const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
		const estimateGasCall = fetchCalls.find((call: unknown[]) => {
			const opts = call[1] as { body?: string } | undefined;
			if (!opts?.body) return false;
			const parsed = JSON.parse(opts.body);
			return parsed.method === 'eth_estimateGas';
		});
		expect(estimateGasCall).toBeDefined();
	});

	it('uses connected wallet address when sourceConnectedWalletId is provided', async () => {
		const connectedAddr = '0x1111111111111111111111111111111111111111';
		const { getHandle } = await import('$lib/stores/connected-wallets.store');
		(getHandle as ReturnType<typeof vi.fn>).mockReturnValue({ address: connectedAddr });

		globalThis.fetch = mockRpcFetch({
			getBalance: '0x246139ca8000', // 4000 sats — sufficient
			gasPrice: '0x18daac0',
			estimateGas: '0x1e848'
		});

		const setup = createMockSetup({ amountSats: 3267 });
		const result = await lockRskFunds(setup, 'wallet-123');

		expect(result.error).toBeNull();
		expect(getHandle).toHaveBeenCalledWith('wallet-123');

		// Verify the balance query was for the connected wallet address
		const fetchCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls;
		const balanceCall = fetchCalls.find((call: unknown[]) => {
			const opts = call[1] as { body?: string } | undefined;
			if (!opts?.body) return false;
			const parsed = JSON.parse(opts.body);
			return parsed.method === 'eth_getBalance';
		});
		expect(balanceCall).toBeDefined();
		const balanceParams = JSON.parse((balanceCall![1] as { body: string }).body).params;
		expect(balanceParams[0].toLowerCase()).toBe(connectedAddr.toLowerCase());
	});

	it('falls back to default gas price when fetchGasPrice fails', async () => {
		// fetchGasPrice throws → lockRskFunds catches and uses fallback: 26,000,000 wei
		// Gas cost: 150,000 * 26,000,000 = 3,900,000,000,000 wei ≈ 390 sats
		// Total: 3267 + 390 = 3657 sats
		globalThis.fetch = mockRpcFetch({
			getBalance: '0x1db693beac00', // 3267 sats
			gasPriceError: new Error('gas price RPC failed'),
			estimateGas: '0x1e848'        // 125,000 → 150,000 with buffer
		});

		const setup = createMockSetup({ amountSats: 3267 });
		const result = await lockRskFunds(setup, null);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('Insufficient RBTC for gas');
		// With fallback gas price 26,000,000 wei:
		// Gas cost: 150000 * 26000000 = 3,900,000,000,000 wei = 390 sats
		// Total: 3267 + 390 = 3657, shortfall = 3657 - 3267 = 390
		expect(result.error!.message).toContain('Shortfall: 390 sats');
		expect(sendEvmTransaction).not.toHaveBeenCalled();
	});
});

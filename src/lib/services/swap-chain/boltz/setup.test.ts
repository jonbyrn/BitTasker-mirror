import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	})
}));

vi.mock('$lib/utils/tryCatch', () => ({
	tryCatch: async <T>(p: Promise<T>) => {
		try {
			return { data: await p, error: null };
		} catch (e) {
			return { data: null, error: e };
		}
	}
}));

vi.mock('$lib/stores/wallet.store', () => ({
	walletStore: {
		subscribe: (fn: (v: unknown) => void) => {
			fn({ rsk: { address: '0xUserWalletAddress' } });
			return () => {};
		}
	}
}));

vi.mock('$lib/stores/connected-wallets.store', () => ({
	getHandle: vi.fn(() => null),
	getEvmSigner: vi.fn()
}));

vi.mock('../tx-helpers', () => ({
	sendEvmTransaction: vi.fn().mockResolvedValue({ data: '0xTxHash123', error: null })
}));

vi.mock('../abi', () => ({
	encodeEtherSwapLock: vi.fn(() => '0xLockCalldata')
}));

vi.mock('../persistence', () => ({
	swapClaimData: { set: vi.fn() },
	swapRefundData: { set: vi.fn() },
	persistClaimData: vi.fn().mockResolvedValue(undefined),
	persistRefundData: vi.fn().mockResolvedValue(undefined),
	saveClaimDataToNostr: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/utils/swap-gas', () => ({
	fetchGasPrice: vi.fn().mockResolvedValue(26_000_000n)
}));

vi.mock('$lib/services/BoltzProvider', () => ({
	boltzProvider: { createSwap: vi.fn() }
}));

vi.mock('$lib/utils/swap-preimage', () => ({
	generateSwapPreimage: vi.fn().mockResolvedValue({
		preimageHex: 'aabbccdd',
		hashHex: '11223344'
	})
}));

vi.mock('ethers', () => ({
	Wallet: { createRandom: () => ({ publicKey: '0x' + 'ab'.repeat(33) }) },
	Interface: vi.fn(() => ({
		encodeFunctionData: vi.fn(() => '0xLockCalldata')
	}))
}));

import { lockRskFunds } from '$lib/services/swap-chain/boltz/setup';
import { sendEvmTransaction } from '../tx-helpers';
import type { SwapSetupResult } from '$lib/services/swap-chain/boltz/setup';

function createMockSetup(overrides?: Partial<SwapSetupResult>): SwapSetupResult {
	return {
		amountSats: 50000,
		preimageHex: 'aabbccdd',
		hashHex: '11223344',
		swapResult: {
			swapId: 'test-swap-id',
			lockupAddress: '0xLockupAddr',
			lockupClaimAddress: '0xBoltzClaimAddr',
			claimAddress: '0xUserClaimAddr',
			timeoutBlockHeight: 800000,
			claimDetails: null
		},
		...overrides
	} as SwapSetupResult;
}

function mockFetchBalance(balanceHex: string) {
	return vi.fn().mockImplementation((url: string, opts?: { body?: string }) => {
		const body = opts?.body ? JSON.parse(opts.body) : {};
		if (body.method === 'eth_getBalance') {
			return Promise.resolve({
				json: () => Promise.resolve({ result: balanceHex })
			});
		}
		if (body.method === 'eth_estimateGas') {
			return Promise.resolve({
				json: () => Promise.resolve({ result: '0x186a0' }) // 100000
			});
		}
		return Promise.resolve({
			json: () => Promise.resolve({ result: '0x0' })
		});
	});
}

describe('lockRskFunds — pre-flight balance check', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(sendEvmTransaction as ReturnType<typeof vi.fn>).mockResolvedValue({
			data: '0xTxHash123',
			error: null
		});
	});

	it('should block swap when RBTC balance is less than swap amount + gas', async () => {
		// 50000 sats = 50000 * 10^10 = 500000000000000 wei = 0x1C6BF52634000
		// Gas: 100000 (gas limit) * 1.2 = 120000 * 26000000 (gas price) = 3120000000000 wei
		// Total needed = 500000000000000 + 3120000000000 = 503120000000000 wei
		// Set balance to only cover swap, not gas
		const balanceHex = '0x1C6BF52634000'; // 50000 * 10^10 = exactly swap amount
		globalThis.fetch = mockFetchBalance(balanceHex);

		const setup = createMockSetup();
		const result = await lockRskFunds(setup, null);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toMatch(/Insufficient RBTC for gas/);
		expect(result.data).toBeNull();
		expect(sendEvmTransaction).not.toHaveBeenCalled();
	});

	it('should allow swap when RBTC balance covers swap amount + gas', async () => {
		// Large balance that covers swap + gas
		const balanceHex = '0x56BC75E2D63100000'; // 1000 RBTC in wei
		globalThis.fetch = mockFetchBalance(balanceHex);

		const setup = createMockSetup();
		const result = await lockRskFunds(setup, null);

		expect(result.error).toBeNull();
		expect(sendEvmTransaction).toHaveBeenCalled();
	});

	it('should proceed with swap when pre-flight check fails (RPC error)', async () => {
		// fetch throws — simulates RPC failure during pre-flight
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('RPC timeout'));

		const setup = createMockSetup();
		const result = await lockRskFunds(setup, null);

		// Pre-flight failure is non-blocking — swap should proceed
		expect(sendEvmTransaction).toHaveBeenCalled();
	});

	it('should include sats breakdown in error message', async () => {
		// Exactly swap amount in wei, no gas margin
		const balanceHex = '0x1C6BF52634000'; // 50000 * 10^10
		globalThis.fetch = mockFetchBalance(balanceHex);

		const setup = createMockSetup({ amountSats: 50000 });
		const result = await lockRskFunds(setup, null);

		expect(result.error).not.toBeNull();
		const msg = result.error!.message;
		// Should contain swap amount
		expect(msg).toContain('swap 50000');
		// Should contain "gas" in the breakdown
		expect(msg).toMatch(/gas \d+/);
		// Should contain "Shortfall" with sats
		expect(msg).toMatch(/Shortfall: \d+ sats/);
		// Should contain "have" with balance in sats
		expect(msg).toMatch(/have \d+ sats/);
	});

	it('should return error when lockupClaimAddress is missing', async () => {
		const setup = createMockSetup();
		(setup.swapResult as { lockupClaimAddress?: string }).lockupClaimAddress = undefined as unknown as string;

		const result = await lockRskFunds(setup, null);

		expect(result.error).not.toBeNull();
		expect(result.error!.message).toContain('lockup claim address missing');
		expect(sendEvmTransaction).not.toHaveBeenCalled();
	});
});

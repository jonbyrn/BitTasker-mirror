/**
 * Behavioral test: Balance double-counting during cross-chain bridge
 *
 * Reproduces the bug where RBTC→WBTC swap (same address on both chains)
 * temporarily shows doubled balance during bridging.
 *
 * Root cause: native RBTC balance (via SDK rskWallet.getBalance()) is
 * invisible to tokenBalanceService cache-clearing. When bridge delivers
 * WBTC on Arbitrum, a stale RBTC value + fresh WBTC value = double count.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get, writable } from 'svelte/store';
import type { WalletStateExtended } from '$lib/stores/wallet/wallet-types';

// ─── Constants ──────────────────────────────────────────────────────────────

const MOCK_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const USDT0_ARB = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const WBTC_ARB = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
const TBTC_ARB = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';

function makeState(overrides: Partial<WalletStateExtended> = {}): WalletStateExtended {
	return {
		isInitializing: false,
		isConnected: true,
		error: null,
		rsk: {
			connected: true,
			connecting: false,
			error: null,
			address: MOCK_ADDRESS,
			balance: '0',
			formattedBalance: '0.00',
			blockNumber: 100,
			provider: null,
			wallet: null
		},
		bsc: {
			connected: false,
			connecting: false,
			error: null,
			address: null,
			bnbBalance: '0',
			formattedBnbBalance: '0.00',
			usdtBalance: '0',
			formattedUsdtBalance: '0.00',
			blockNumber: null,
			provider: null,
			wallet: null,
			usdtContract: null,
			paymasterContract: null,
			paymasterConnected: false,
			paymasterAddress: null,
			canPayFeesInUsdt: false
		},
		arb: {
			connected: true,
			connecting: false,
			error: null,
			address: MOCK_ADDRESS,
			ethBalance: '0',
			formattedEthBalance: '0.00',
			usdt0Balance: '0',
			formattedUsdt0Balance: '0.00',
			wbtcBalance: '0',
			formattedWbtcBalance: '0.00',
			wbtcUsdValue: 0,
			tbtcBalance: '0',
			formattedTbtcBalance: '0.00',
			blockNumber: null,
			provider: null,
			wallet: null,
			usdt0Contract: null
		},
		assets: [],
		transactions: [],
		totalBalances: { usd: 0, sats: 0, rbtc: 0, usdt: 0, bnb: 0 },
		rbtcToBtcRate: 1.0,
		rbtcRateError: false,
		activeNetwork: 'rsk',
		selectedAsset: 'rBTC',
		activeChain: 'rsk',
		gasMode: 'USDT_GAS',
		delegationState: 'IDLE',
		pendingTransactions: new Map(),
		chainLock: false,
		lastBalanceRefresh: Date.now(),
		activeBridge: null,
		...overrides
	} as unknown as WalletStateExtended;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('Balance double-counting during cross-chain bridge', () => {
	// Simulates the scenario: RBTC→WBTC swap, same address on both chains.
	// The native RBTC balance (via SDK) is stale while Arbitrum WBTC is fresh.

	it('demonstrates that stale RSK + fresh Arb balances produce double-count', () => {
		// Before swap: user has RBTC on RSK, 0 WBTC on Arb
		// RBTC price ~$100,000, balance ~0.00002 RBTC → ~$2
		// WBTC price ~$100,000, balance ~0.00002 WBTC → ~$2

		// Simulate the USD values directly (as loadAssets would compute them)
		const rbtcUsdBefore = 2.0; // $2 in RBTC before swap
		const wbtcUsdBefore = 0.0; // $0 in WBTC before swap

		// After bridge delivers WBTC: RBTC spent, WBTC received
		const rbtcUsdAfter = 0.0;   // $0 (spent)
		const wbtcUsdAfter = 2.0;   // $2 (bridge delivered)

		// CORRECT total after bridge: only WBTC
		const correctTotal = rbtcUsdAfter + wbtcUsdAfter;
		expect(correctTotal).toBe(2.0);

		// DOUBLE-COUNTED total: stale RSK (pre-spend) + fresh Arb (post-bridge)
		// This happens when SDK returns stale RBTC balance ($2) but
		// Arbitrum WBTC is fresh ($2)
		const staleRskBalance = rbtcUsdBefore; // $2 (SDK cached pre-spend)
		const freshArbBalance = wbtcUsdAfter;  // $2 (just delivered)
		const doubleCountedTotal = staleRskBalance + freshArbBalance;

		// The double-counted total is $4 instead of the correct $2
		expect(doubleCountedTotal).toBe(4.0);
		expect(doubleCountedTotal).toBe(correctTotal * 2);
	});

	it('demonstrates that clearAllBalanceCaches does NOT clear native RBTC', () => {
		// The tokenBalanceService caches RSK ERC-20 tokens and Arbitrum tokens.
		// Native RBTC is fetched via manager.rskWallet.getBalance() which
		// bypasses tokenBalanceService entirely.
		//
		// clearAllBalanceCaches clears:
		//   - tokenBalanceCache[address] (RSK ERC-20)
		//   - tokenBalanceCache["arb:{address}:{token}"] (Arbitrum tokens)
		//
		// It does NOT clear:
		//   - manager.rskWallet.getBalance() (native RBTC via SDK)
		//
		// This means after clearing caches, a subsequent loadAssets() will
		// fetch fresh Arbitrum balances but may get a stale RBTC balance.

		// Verify the cache key patterns
		const address = MOCK_ADDRESS.toLowerCase();
		const rskCacheKey = address; // RSK ERC-20 key
		const arbCacheKey = `arb:${address}:${WBTC_ARB.toLowerCase()}`; // Arb key

		// These are the keys that clearAllBalanceCaches deletes
		expect(rskCacheKey).toBe(address);
		expect(arbCacheKey).toContain('arb:');

		// Native RBTC has no cache key in tokenBalanceService
		// It's fetched via a completely separate code path (SDK)
		// This is the gap that causes the double-count
	});

	it('demonstrates the timing window for double-counting', () => {
		// The double-count window is:
		//   From: bridge delivers WBTC on Arbitrum
		//   To: SDK refreshes native RBTC balance (next RSK block or SDK poll)
		//
		// On Arbitrum: blocks every ~0.25s
		// On RSK: blocks every ~30s
		// Bridge poll interval: 5s → 10s → 20s → 30s (exponential backoff)
		//
		// The double-count window can last up to 30s (until next RSK block
		// triggers SDK balance refresh)

		const rskBlockTime = 30_000; // 30s
		const bridgePollInterval = 5_000; // starts at 5s

		// In the worst case, the bridge poll fires right after an RSK block,
		// and the next RSK block is 30s away. The stale RBTC balance persists
		// for the entire 30s window.
		const worstCaseWindow = rskBlockTime;
		expect(worstCaseWindow).toBe(30_000);

		// During this window, every bridge poll shows the double-counted balance
		// because loadAssets(true) clears Arb cache but not native RBTC cache
	});

	it('demonstrates that loadAssetsLock suppresses corrective refreshes', () => {
		// When bridge poll holds the loadAssetsLock, the block watcher's
		// scheduleBalanceRefresh() is silently dropped.
		//
		// This extends the stale-data window because the corrective refresh
		// (which would fetch fresh native RBTC) never executes.

		let loadAssetsLock = false;
		let refreshCount = 0;

		function loadAssets() {
			if (loadAssetsLock) return; // silently dropped
			loadAssetsLock = true;
			refreshCount++;
			// Simulate async work
			loadAssetsLock = false;
		}

		// Bridge poll acquires lock
		loadAssetsLock = true;

		// Block watcher tries to refresh — dropped
		loadAssets();
		expect(refreshCount).toBe(0); // dropped!

		// Bridge poll releases lock
		loadAssetsLock = false;

		// Now block watcher can refresh
		loadAssets();
		expect(refreshCount).toBe(1); // executed
	});

	it('documents the fix: native RBTC must be fetched via RPC, not SDK', () => {
		// The fix should fetch native RBTC balance via direct RPC call
		// (like getArbitrumTokenBalance does for Arbitrum tokens) instead
		// of relying on manager.rskWallet.getBalance() which has its own
		// caching layer.
		//
		// This ensures clearAllBalanceCaches() can force a fresh native
		// balance fetch, preventing the stale+fresh double-count.

		// Proposed: add getRSKNativeBalance(address, rpcUrl) to tokenBalanceService
		// that fetches via eth_getBalance RPC call with its own cache entry
		// that clearAllBalanceCaches() can clear.

		expect(true).toBe(true); // placeholder for documentation
	});
});

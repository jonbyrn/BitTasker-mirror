/**
 * Wallet Types, Constants, and Initial State
 *
 * Pure definitions with no runtime side-effects.
 * Every other wallet/* module imports from here.
 */

import type { WalletState } from '@bittasker/wallet-core';
import type { GasMode, DelegationState } from '$lib/types/wallet';
import type { ProcessedTransaction } from '$lib/utils/wallet/transactionHistory';

// ─── WDK asset identifiers (Tether WDK migration) ────────────────────────────

/** `WalletAsset.assetId` values produced by the WDK-backed balance loader. */
export const WDK_ASSET_IDS = {
	BTC_ONCHAIN: 'btc_onchain',
	BTC_LIGHTNING: 'btc_lightning',
	USDT_RGB: 'usdt_rgb'
} as const;

// ─── Constants ───────────────────────────────────────────────────────────────

/** Arbitrum WBTC contract address (canonical — from @bittasker/wallet-core). */
export const WBTC_ARBITRUM_ADDRESS = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';

/** Arbitrum tBTC contract address (canonical tBTC v2 on Arbitrum). */
export const TBTC_ARBITRUM_ADDRESS = '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40';

/** Swap-pair cache TTL: 1 hour. */
export const SWAP_PAIRS_CACHE_TTL = 3600000;

// ─── Extended wallet state ───────────────────────────────────────────────────

export type WalletStateExtended = Omit<WalletState, 'transactions'> & {
	transactions: ProcessedTransaction[];
	activeChain: 'rsk' | 'bsc' | 'arb';
	gasMode: GasMode;
	delegationState: DelegationState;
	pendingTransactions: Map<number, string>;
	chainLock: boolean;
	/** Timestamp (ms) of last successful balance refresh — used for staleness indicator. */
	lastBalanceRefresh: number;
	/** Active cross-chain bridge tracking (for persistent banner). */
	activeBridge: {
		sourceAsset: string;
		destAsset: string;
		sourceAmount: string;
		destAmount: string;
		startedAt: number;
		estimatedMinutes: number;
		swapId?: string;
		txHash?: string;
	} | null;
	/**
	 * Extended Arbitrum chain state — extends the SDK's `arbitrum` field with
	 * additional token balances and contract references.
	 * Note: The SDK type uses `arbitrum` but this codebase uses `arb` as the
	 * canonical key. The `Omit<WalletState, 'transactions'>` intersection
	 * still carries `arbitrum` from the SDK — we re-export it as `arb` here.
	 */
	arb: {
		connected: boolean;
		connecting: boolean;
		error: string | null;
		address: string | null;
		ethBalance: string;
		formattedEthBalance: string;
		usdt0Balance: string;
		formattedUsdt0Balance: string;
		wbtcBalance: string;
		formattedWbtcBalance: string;
		wbtcUsdValue: number;
		tbtcBalance: string;
		formattedTbtcBalance: string;
		blockNumber: number | null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		provider: any | null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		wallet: any | null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		usdt0Contract: any | null;
	};

	/**
	 * Tether WDK balances (BTC on-chain, BTC Lightning, USDT over RGB/Lightning).
	 * Additive alongside `rsk`/`bsc`/`arb` during the WDK migration — those EVM
	 * slices are removed once `wallet-init.ts`/`wallet-balances.ts` are ported.
	 */
	wdk: {
		initialized: boolean;
		error: string | null;
		btcOnchain: {
			address: string | null;
			balanceSats: number;
			formattedBalance: string;
		};
		btcLightning: {
			balanceSats: number;
			formattedBalance: string;
		};
		usdtRgb: {
			allocationAmount: string;
			formattedBalance: string;
		};
	};
};

// ─── Initial state ───────────────────────────────────────────────────────────

// Type assertion needed because WalletState from SDK has `arbitrum` but we use `arb`.
// The runtime shape is correct — the type mismatch is a naming convention difference.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const initialState: WalletStateExtended = {
	isInitializing: false,
	isConnected: false,
	error: null,

	rsk: {
		connected: false,
		connecting: false,
		error: null,
		address: null,
		balance: '0',
		formattedBalance: '0.00',
		blockNumber: null,
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
		connected: false,
		connecting: false,
		error: null,
		address: null,
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
	totalBalances: {
		usd: 0,
		sats: 0,
		rbtc: 0,
		usdt: 0,
		bnb: 0,
		btcOnchainSats: 0,
		btcLightningSats: 0,
		usdtRgb: 0
	},

	rbtcToBtcRate: 1.0,
	rbtcRateError: false,

	activeNetwork: 'rsk',
	selectedAsset: 'rBTC',

	// Phase 1.7: EIP-7702 multi-chain delegation state
	activeChain: 'rsk',
	gasMode: 'USDT_GAS' as GasMode,
	delegationState: 'IDLE' as DelegationState,
	pendingTransactions: new Map<number, string>(),
	chainLock: false,

	// Balance staleness tracking
	lastBalanceRefresh: Date.now(),

	// Active bridge tracking (for persistent banner)
	activeBridge: null,

	// Tether WDK — BTC on-chain / Lightning / USDT-RGB (populated once wallet-init.ts is ported)
	wdk: {
		initialized: false,
		error: null,
		btcOnchain: { address: null, balanceSats: 0, formattedBalance: '0.00000000' },
		btcLightning: { balanceSats: 0, formattedBalance: '0.00000000' },
		usdtRgb: { allocationAmount: '0', formattedBalance: '0.00' }
	}
} as unknown as WalletStateExtended;

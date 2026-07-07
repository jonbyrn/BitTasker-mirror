/**
 * Wallet Types, Constants, and Initial State
 *
 * Pure definitions with no runtime side-effects.
 * Every other wallet/* module imports from here.
 */

import type { WalletState } from '@bittasker/wallet-core';
import type { GasMode, DelegationState } from '$lib/types/wallet';
import type { ProcessedTransaction } from '$lib/utils/wallet/transactionHistory';

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
};

// ─── Initial state ───────────────────────────────────────────────────────────

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
		bnb: 0
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
	lastBalanceRefresh: Date.now()
};

export {
	initialize,
	disconnectWallet,
	softCleanup,
	markExpectingInbound,
	getRgbAddress
} from './wallet-init';

export { loadAssets, scheduleBalanceRefresh } from './wallet-balances';

export { loadTransactions } from './wallet-transactions';

export { sendBtc } from './wallet-send';

export { formatSats, formatUsd, formatAddress } from './wallet-utils';

export { walletManager } from './wallet-manager';

export type {
	WalletStateExtended,
	RgbAsset,
	RgbState,
	BtcOnchainState,
	WdkState,
	ArbState,
	TotalBalances,
	Transaction
} from './wallet-types';

export { state, isRgbWalletReady, clearRefreshTimers } from './wallet-state';

import { derived } from 'svelte/store';
import { walletStore } from './wallet-state';

export const allAssets = derived(walletStore, ($s) => $s.assets ?? []);
export const totalBalances = derived(
	walletStore,
	($s) => $s.totalBalances ?? { usd: 0, sats: 0, usdt: 0 }
);

export { walletStore } from './wallet-state';

/** @deprecated - Bitcoin/RGB only, no EVM provider */
export const getProvider = () => null;
/** @deprecated - Bitcoin/RGB only, no EVM wallet */
export const getWallet = () => null;
/** @deprecated - EVM removed */
export const getRSKWallet = () => null;
/** @deprecated - EVM removed */
export const getRSKProvider = () => null;
/** @deprecated - EVM removed */
export const loadRSKTokenBalances = async (): Promise<never[]> => [];
/** @deprecated - EVM removed */
export const getTokenBalance = async () => null;
/** @deprecated - EVM removed */
export const loadRbtcExchangeRate = async () => 0;

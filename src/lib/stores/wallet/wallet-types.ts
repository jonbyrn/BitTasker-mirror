export type WalletFactory = (
	args: Record<string, unknown>
) => Promise<import('@utexo/rgb-sdk-web').UTEXOWallet> | import('@utexo/rgb-sdk-web').UTEXOWallet;

export type WalletProbeWindow = Window & {
	__PLAYWRIGHT_TEST__?: boolean;
	__btcAddress?: string;
	__btcBalanceSats?: number;
	__btcUtxoCount?: number;
	__btcFingerprint?: string;
	__btcWalletSynced?: boolean;
	__connectWallet?: () => Promise<void>;
	__refreshBtcBalance?: () => Promise<void>;
	__sendBtc?: (params: {
		address: string;
		amountSats: number;
		feeRate?: number;
	}) => Promise<string>;
};

export interface RgbAsset {
	assetId: string;
	name: string;
	symbol?: string;
	precision?: number;
	balance: number;
	/** Units rgb-lib will sign. Zero while a receive is still confirming. */
	spendable?: number;
	formattedBalance: string;
	usdValue?: number;
}

export interface RgbState {
	initialized: boolean;
	error: string | null;
	address: string | null;
	balanceSats: number;
	formattedBalance: string;
	assets: RgbAsset[];
}

export interface BtcOnchainState {
	address: string;
	balanceSats: number;
	formattedBalance: string;
}

export interface WdkState {
	initialized: boolean;
	error: string | null;
	btcOnchain: BtcOnchainState;
}

export interface TotalBalances {
	usd: number;
	sats: number;
	usdt: number;
}

export interface ArbState {
	formattedUsdt0Balance: string;
	formattedWbtcBalance: string;
	formattedTbtcBalance: string;
}

export interface Transaction {
	id: string;
	type: 'send' | 'receive' | 'escrow_lock' | 'escrow_release' | 'escrow_cancel';
	amountSats: number;
	/** RGB base units when this row is an asset transfer. Fee sats stay in amountSats. */
	assetUnits?: number;
	amountUsd?: number;
	timestamp: number;
	status: 'pending' | 'confirmed' | 'failed';
	txHash?: string;
	paymentHash?: string;
	counterparty?: string;
	description?: string;
}

export interface WalletStateExtended {
	isInitializing: boolean;
	isConnected: boolean;
	error: string | null;
	arb: ArbState;
	rgb: RgbState;
	wdk: WdkState;
	assets: RgbAsset[];
	transactions: Transaction[];
	totalBalances: TotalBalances;
	activeNetwork: string;
	selectedAsset: string;
	activeChain: string;
}

export const initialState: WalletStateExtended = {
	isInitializing: false,
	isConnected: false,
	error: null,
	arb: {
		formattedUsdt0Balance: '0.00',
		formattedWbtcBalance: '0.000000',
		formattedTbtcBalance: '0 Sats'
	},
	rgb: {
		initialized: false,
		error: null,
		address: null,
		balanceSats: 0,
		formattedBalance: '0.00000000',
		assets: []
	},
	wdk: {
		initialized: false,
		error: null,
		btcOnchain: {
			address: '',
			balanceSats: 0,
			formattedBalance: '0.00000000'
		}
	},
	assets: [],
	transactions: [],
	totalBalances: {
		usd: 0,
		sats: 0,
		usdt: 0
	},
	activeNetwork: 'rgb_lightning',
	selectedAsset: 'BTC',
	activeChain: 'rgb'
};

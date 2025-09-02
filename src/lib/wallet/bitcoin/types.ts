/**
 * Bitcoin Wallet Types
 * For the Bitcoin savings wallet functionality
 */

export interface BitcoinWalletConfig {
	network: 'mainnet' | 'testnet';
	apiUrl?: string;
	derivationPath?: string;
}

export interface BitcoinAddress {
	address: string;
	privateKey: string;
	publicKey: string;
	index: number;
	used: boolean;
	balance: number;
}

export interface BitcoinTransaction {
	txid: string;
	confirmations: number;
	blockHeight?: number;
	timestamp: Date;
	amount: number;
	fee: number;
	inputs: BitcoinInput[];
	outputs: BitcoinOutput[];
	type: 'send' | 'receive';
	status: 'pending' | 'confirmed' | 'failed';
}

export interface BitcoinInput {
	txid: string;
	vout: number;
	value: number;
	address: string;
}

export interface BitcoinOutput {
	address: string;
	value: number;
	index: number;
}

export interface UTXO {
	txid: string;
	vout: number;
	value: number;
	address: string;
	confirmed: boolean;
	blockHeight?: number;
}

export interface FeeEstimate {
	slow: number;    // sats/vB
	medium: number;  // sats/vB
	fast: number;    // sats/vB
}

export interface CreateTransactionParams {
	toAddress: string;
	amount: number;
	feeRate: number;
	message?: string;
}

export interface TransactionPreview {
	amount: number;
	fee: number;
	total: number;
	inputs: UTXO[];
	changeAmount: number;
	changeAddress?: string;
	estimatedSize: number;
}

export interface WalletBalance {
	confirmed: number;
	unconfirmed: number;
	total: number;
}

export interface BitcoinWalletInfo {
	balance: WalletBalance;
	addresses: BitcoinAddress[];
	transactions: BitcoinTransaction[];
	network: string;
	derivationPath: string;
}

// Swap-related types
export interface SwapQuote {
	fromAmount: number;
	toAmount: number;
	fee: number;
	minerFee: number;
	rate: number;
	minimumAmount: number;
	maximumAmount: number;
}

export interface SwapToLiquidParams {
	amount: number;
	liquidAddress: string;
	feeRate?: number;
}

export interface SwapFromLiquidParams {
	amount: number;
	bitcoinAddress: string;
	liquidTxId: string;
}

// Security types
export interface WalletSecurity {
	encrypted: boolean;
	lastBackup?: Date;
	passkeyProtected: boolean;
	recoveryPhraseShown: boolean;
}

export interface BackupData {
	mnemonic: string;
	derivationPath: string;
	network: string;
	createdAt: Date;
	addresses: string[];
}

// Events
export interface WalletEvent {
	type: 'transaction' | 'balance_update' | 'new_address' | 'sync_complete';
	data: any;
	timestamp: Date;
}

export type WalletEventCallback = (event: WalletEvent) => void;
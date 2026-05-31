/**
 * External Wallet Types — Provider Bridge Signer Interfaces
 *
 * EVM and Bitcoin L1 have separate signing architectures.
 * No conflation — PSBT vs eth_sendTransaction are fundamentally different.
 */

import type { ethers } from 'ethers';

// ---------------------------------------------------------------------------
// EVM Signer
// ---------------------------------------------------------------------------

export interface EVMTransactionRequest {
	to: string;
	value?: bigint;
	data?: string;
	chainId: number;
}

export interface EVMTransactionResult {
	txHash: string;
	from: string;
	chainId: number;
}

export interface EVMSigner {
	readonly type: 'evm';
	readonly label: string;
	readonly address: string;
	readonly chainId: number;
	sendTransaction(tx: EVMTransactionRequest): Promise<EVMTransactionResult>;
	getAddress(): string;
	isConnected(): boolean;
}

// ---------------------------------------------------------------------------
// Bitcoin Signer
// ---------------------------------------------------------------------------

export interface UTXO {
	txid: string;
	vout: number;
	value: bigint;
	witnessUtxo?: { script: Uint8Array; value: bigint };
}

export interface TxOutput {
	address: string;
	value: bigint;
}

export interface BitcoinSendRequest {
	recipient: string;
	amount: bigint;
	feeRateSatsPerVbyte: number;
}

export interface BitcoinSendResult {
	txHash: string;
	signedPSBT: string;
	fee: bigint;
	change: bigint;
	inputs: UTXO[];
	outputs: TxOutput[];
}

export interface BitcoinSigner {
	readonly type: 'bitcoin';
	readonly label: string;
	readonly address: string;
	readonly xpub: string;
	readonly derivationPath: string;
	sendBitcoin(req: BitcoinSendRequest): Promise<BitcoinSendResult>;
	signPSBT(psbt: string): Promise<string>;
	getXPUB(): string;
	getAddress(): string;
	deriveChangeAddress(index: number): string;
	isConnected(): boolean;
}

// ---------------------------------------------------------------------------
// Connector Handle
// ---------------------------------------------------------------------------

export type ConnectorEvent =
	| { type: 'accountsChanged'; accounts: string[] }
	| { type: 'chainChanged'; chainId: number }
	| { type: 'disconnect'; reason: string };

export type ConnectorEventCallback = (event: ConnectorEvent) => void;

export interface ConnectorHandle {
	id: string;
	walletName: string;
	walletType: 'metamask' | 'walletconnect' | 'trezor' | 'ledger';
	address: string;
	chainIds: number[];
	evmSigner?: EVMSigner;
	bitcoinSigner?: BitcoinSigner;
	provider: ethers.Provider | null;
	fetchBalances?: () => Promise<
		Record<string, { raw: string; formatted: string; loading: boolean }>
	>;
	onEvent: ConnectorEventCallback;
	unsubscribe: () => void;
}

// ---------------------------------------------------------------------------
// Error Types
// ---------------------------------------------------------------------------

export class WalletNotConnectedError extends Error {
	constructor(sourceId: string) {
		super(`Wallet not connected: ${sourceId}`);
		this.name = 'WalletNotConnectedError';
	}
}

export class EVMSignerNotAvailableError extends Error {
	constructor(sourceId: string) {
		super(`EVM signer not available for: ${sourceId}`);
		this.name = 'EVMSignerNotAvailableError';
	}
}

export class BitcoinSignerNotAvailableError extends Error {
	constructor(sourceId: string) {
		super(`Bitcoin signer not available for: ${sourceId}`);
		this.name = 'BitcoinSignerNotAvailableError';
	}
}

export class UserCancelledError extends Error {
	constructor() {
		super('User cancelled the transaction');
		this.name = 'UserCancelledError';
	}
}

export class DeviceDisconnectedError extends Error {
	constructor(device: string) {
		super(`${device} disconnected during operation`);
		this.name = 'DeviceDisconnectedError';
	}
}

export class TransactionInProgressError extends Error {
	constructor(sourceId: string) {
		super(`Transaction already in progress from: ${sourceId}`);
		this.name = 'TransactionInProgressError';
	}
}

// ---------------------------------------------------------------------------
// Balance Types
// ---------------------------------------------------------------------------

export interface SafeBalance {
	raw: bigint;
	formatted: string;
	decimals: number;
}

export interface ConnectedWalletState {
	version: number;
	wallets: Array<{
		id: string;
		walletName: string;
		walletType: 'metamask' | 'walletconnect' | 'trezor' | 'ledger';
		address: string;
		chainIds: number[];
		connectedAt: number;
		btcAddress?: string;
	}>;
}

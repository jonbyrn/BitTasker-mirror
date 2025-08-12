/**
 * Bitcoin HD Wallet Implementation
 *
 * ⚠️ @DEPRECATED - NOT USED WITH BREEZ SDK ⚠️
 *
 * This file contains a custom Bitcoin wallet implementation that is NOT used
 * in the current Breez SDK integration. The Breez SDK already provides comprehensive
 * Bitcoin functionality through submarine swaps and on-chain interoperability.
 *
 * This implementation remains for reference purposes and potential future use cases
 * where a pure Bitcoin-only wallet (separate from Lightning/Liquid) might be needed.
 *
 * For Bitcoin operations in the app, use the Breez SDK methods instead:
 * - sendOnchainPayment() for sending to Bitcoin addresses
 * - prepareReceivePayment() with bitcoinAddress method for receiving
 * - fetchOnchainLimits() for Bitcoin transaction limits
 *
 * Original purpose: Provides Bitcoin savings wallet functionality
 */

import * as bitcoin from 'bitcoinjs-lib';
import BIP32Factory from 'bip32';
import * as ecc from '@bitcoinerlab/secp256k1';
import * as bip39 from 'bip39';
import { writable, type Writable } from 'svelte/store';
import type {
	BitcoinWalletConfig,
	BitcoinAddress,
	BitcoinTransaction,
	UTXO,
	FeeEstimate,
	CreateTransactionParams,
	TransactionPreview,
	WalletBalance,
	BitcoinWalletInfo,
	WalletEvent,
	WalletEventCallback,
	BackupData
} from './types';
import { breezSecurity } from '../breez/security';

export class BitcoinWallet {
	private config: BitcoinWalletConfig;
	private network: bitcoin.Network;
	private masterKey: ReturnType<ReturnType<typeof BIP32Factory>['fromSeed']> | null = null;
	private addresses: Map<number, BitcoinAddress> = new Map();
	private transactions: BitcoinTransaction[] = [];
	private utxos: UTXO[] = [];
	private currentIndex = 0;
	private balanceStore: Writable<WalletBalance> = writable({
		confirmed: 0,
		unconfirmed: 0,
		total: 0
	});
	private eventCallbacks: WalletEventCallback[] = [];

	constructor(config: BitcoinWalletConfig) {
		this.config = config;
		this.network =
			config.network === 'mainnet' ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
	}

	/**
	 * Initialize wallet with mnemonic
	 */
	async initialize(mnemonic: string): Promise<void> {
		if (!bip39.validateMnemonic(mnemonic)) {
			throw new Error('Invalid mnemonic');
		}

		const seed = await bip39.mnemonicToSeed(mnemonic);
		const bip32 = BIP32Factory(ecc);
		this.masterKey = bip32.fromSeed(seed, this.network);

		// Load persisted state
		await this.loadPersistedState();

		// Generate initial addresses if none exist
		if (this.addresses.size === 0) {
			await this.generateAddresses(5); // Generate 5 initial addresses
		}

		// Start syncing
		await this.sync();
	}

	/**
	 * Generate new receiving address
	 */
	async generateNewAddress(): Promise<string> {
		if (!this.masterKey) {
			throw new Error('Wallet not initialized');
		}

		const derivationPath = this.config.derivationPath || "m/84'/0'/0'/0";
		const child = this.masterKey.derivePath(`${derivationPath}/${this.currentIndex}`);

		const { address } = bitcoin.payments.p2wpkh({
			pubkey: child.publicKey,
			network: this.network
		});

		if (!address) {
			throw new Error('Failed to generate address');
		}

		const bitcoinAddress: BitcoinAddress = {
			address,
			privateKey: child.toWIF(),
			publicKey: child.publicKey.toString('hex'),
			index: this.currentIndex,
			used: false,
			balance: 0
		};

		this.addresses.set(this.currentIndex, bitcoinAddress);
		this.currentIndex++;

		await this.persistState();
		this.emitEvent({
			type: 'new_address',
			data: { address },
			timestamp: new Date()
		});

		return address;
	}

	/**
	 * Get current receiving address
	 */
	getCurrentAddress(): string {
		const unusedAddress = Array.from(this.addresses.values()).find((addr) => !addr.used);

		return unusedAddress?.address || '';
	}

	/**
	 * Get all addresses
	 */
	getAddresses(): BitcoinAddress[] {
		return Array.from(this.addresses.values());
	}

	/**
	 * Get wallet balance
	 */
	getBalance(): WalletBalance {
		const confirmed = this.utxos
			.filter((utxo) => utxo.confirmed)
			.reduce((sum, utxo) => sum + utxo.value, 0);

		const unconfirmed = this.utxos
			.filter((utxo) => !utxo.confirmed)
			.reduce((sum, utxo) => sum + utxo.value, 0);

		return {
			confirmed,
			unconfirmed,
			total: confirmed + unconfirmed
		};
	}

	/**
	 * Get balance store for reactive UI
	 */
	getBalanceStore(): Writable<WalletBalance> {
		return this.balanceStore;
	}

	/**
	 * Get transaction history
	 */
	getTransactions(): BitcoinTransaction[] {
		return [...this.transactions].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
	}

	/**
	 * Create and sign transaction
	 */
	async createTransaction(params: CreateTransactionParams): Promise<string> {
		if (!this.masterKey) {
			throw new Error('Wallet not initialized');
		}

		// Verify passkey for Bitcoin transaction
		const isAuthorized = await breezSecurity.verifyPasskeyForOffPlatform(
			params.toAddress,
			params.amount
		);

		if (!isAuthorized) {
			throw new Error('Transaction not authorized - passkey verification failed');
		}

		const preview = await this.previewTransaction(params);

		const psbt = new bitcoin.Psbt({ network: this.network });

		// Add inputs
		for (const utxo of preview.inputs) {
			const addressInfo = this.findAddressByAddress(utxo.address);
			if (!addressInfo) continue;

			psbt.addInput({
				hash: utxo.txid,
				index: utxo.vout,
				witnessUtxo: {
					script: bitcoin.address.toOutputScript(utxo.address, this.network),
					value: utxo.value
				}
			});
		}

		// Add output to recipient
		psbt.addOutput({
			address: params.toAddress,
			value: params.amount
		});

		// Add change output if needed
		if (preview.changeAmount > 0 && preview.changeAddress) {
			psbt.addOutput({
				address: preview.changeAddress,
				value: preview.changeAmount
			});
		}

		// Sign inputs
		for (let i = 0; i < preview.inputs.length; i++) {
			const utxo = preview.inputs[i];
			const addressInfo = this.findAddressByAddress(utxo.address);
			if (!addressInfo) continue;

			const derivationPath = this.config.derivationPath || "m/84'/0'/0'/0";
			const child = this.masterKey.derivePath(`${derivationPath}/${addressInfo.index}`);
			psbt.signInput(i, child);
		}

		// Finalize and extract transaction
		psbt.finalizeAllInputs();
		const tx = psbt.extractTransaction();
		const txHex = tx.toHex();

		// Broadcast transaction
		const txid = await this.broadcastTransaction(txHex);

		// Update local state
		await this.addPendingTransaction({
			txid,
			confirmations: 0,
			timestamp: new Date(),
			amount: -params.amount,
			fee: preview.fee,
			inputs: preview.inputs.map((utxo) => ({
				txid: utxo.txid,
				vout: utxo.vout,
				value: utxo.value,
				address: utxo.address
			})),
			outputs: [
				{
					address: params.toAddress,
					value: params.amount,
					index: 0
				}
			],
			type: 'send',
			status: 'pending'
		});

		return txid;
	}

	/**
	 * Preview transaction before sending
	 */
	async previewTransaction(params: CreateTransactionParams): Promise<TransactionPreview> {
		const confirmedUtxos = this.utxos.filter((utxo) => utxo.confirmed);

		if (confirmedUtxos.length === 0) {
			throw new Error('No confirmed UTXOs available');
		}

		// Simple UTXO selection (largest first)
		const sortedUtxos = confirmedUtxos.sort((a, b) => b.value - a.value);
		const selectedUtxos: UTXO[] = [];
		let totalInput = 0;

		// Estimate transaction size
		const estimatedSize = this.estimateTransactionSize(sortedUtxos.length, 2); // 2 outputs (recipient + change)
		const estimatedFee = estimatedSize * params.feeRate;
		const totalRequired = params.amount + estimatedFee;

		for (const utxo of sortedUtxos) {
			selectedUtxos.push(utxo);
			totalInput += utxo.value;

			if (totalInput >= totalRequired) {
				break;
			}
		}

		if (totalInput < totalRequired) {
			throw new Error('Insufficient funds');
		}

		const changeAmount = totalInput - params.amount - estimatedFee;
		const changeAddress = changeAmount > 546 ? this.getCurrentAddress() : undefined; // Dust limit

		return {
			amount: params.amount,
			fee: estimatedFee,
			total: totalInput,
			inputs: selectedUtxos,
			changeAmount: changeAmount > 546 ? changeAmount : 0,
			changeAddress,
			estimatedSize
		};
	}

	/**
	 * Get fee estimates
	 */
	async getFeeEstimates(): Promise<FeeEstimate> {
		try {
			// This would normally call an API, but for now return static estimates
			return {
				slow: 10, // ~60 minutes
				medium: 20, // ~20 minutes
				fast: 50 // ~10 minutes
			};
		} catch (error) {
			console.error('Failed to get fee estimates:', error);
			// Return fallback estimates
			return {
				slow: 10,
				medium: 20,
				fast: 50
			};
		}
	}

	/**
	 * Sync wallet with network
	 */
	async sync(): Promise<void> {
		try {
			await Promise.all([this.syncAddresses(), this.syncTransactions(), this.syncUTXOs()]);

			this.updateBalance();
			this.emitEvent({
				type: 'sync_complete',
				data: {},
				timestamp: new Date()
			});
		} catch (error) {
			console.error('Wallet sync failed:', error);
		}
	}

	/**
	 * Backup wallet data
	 */
	async createBackup(): Promise<BackupData> {
		// Verify passkey for backup operation
		const isAuthorized = await breezSecurity.verifyPasskeyForSend(0, 'backup', 'BTC');

		if (!isAuthorized) {
			throw new Error('Backup not authorized - passkey verification failed');
		}

		if (!this.masterKey) {
			throw new Error('Wallet not initialized');
		}

		const mnemonic = this.getMnemonic();
		if (!mnemonic) {
			throw new Error('Mnemonic not available');
		}

		return {
			mnemonic,
			derivationPath: this.config.derivationPath || "m/84'/0'/0'/0",
			network: this.config.network,
			createdAt: new Date(),
			addresses: Array.from(this.addresses.values()).map((addr) => addr.address)
		};
	}

	/**
	 * Add event listener
	 */
	addEventListener(callback: WalletEventCallback): () => void {
		this.eventCallbacks.push(callback);

		return () => {
			const index = this.eventCallbacks.indexOf(callback);
			if (index > -1) {
				this.eventCallbacks.splice(index, 1);
			}
		};
	}

	/**
	 * Get wallet info
	 */
	getWalletInfo(): BitcoinWalletInfo {
		return {
			balance: this.getBalance(),
			addresses: this.getAddresses(),
			transactions: this.getTransactions(),
			network: this.config.network,
			derivationPath: this.config.derivationPath || "m/84'/0'/0'/0"
		};
	}

	// Private methods

	private async generateAddresses(count: number): Promise<void> {
		for (let i = 0; i < count; i++) {
			await this.generateNewAddress();
		}
	}

	private findAddressByAddress(address: string): BitcoinAddress | undefined {
		return Array.from(this.addresses.values()).find((addr) => addr.address === address);
	}

	private estimateTransactionSize(inputs: number, outputs: number): number {
		// P2WPKH transaction size estimation
		const baseSize = 10; // version, locktime, etc.
		const inputSize = inputs * 68; // Each P2WPKH input
		const outputSize = outputs * 31; // Each P2WPKH output
		const witnessSize = inputs * 107; // Witness data

		return baseSize + inputSize + outputSize + Math.ceil(witnessSize / 4);
	}

	// TODO: Implement broadcast transaction
	private async broadcastTransaction(txHex: string): Promise<string> {
		// This would normally broadcast to the network
		// For now, return a mock transaction ID
		const tx = bitcoin.Transaction.fromHex(txHex);
		return tx.getId();
	}

	// TODO: Implement sync addresses
	private async syncAddresses(): Promise<void> {
		// Check which addresses have been used
		for (const address of this.addresses.values()) {
			// This would normally check with an API
			// For now, assume no addresses are used
		}
	}

	// TODO: Implement sync transactions
	private async syncTransactions(): Promise<void> {
		// Fetch transactions for all addresses
		// This would normally call an API
	}

	// TODO: Implement sync UTXOs
	private async syncUTXOs(): Promise<void> {
		// Fetch UTXOs for all addresses
		// This would normally call an API
	}

	private updateBalance(): void {
		const balance = this.getBalance();
		this.balanceStore.set(balance);
	}

	private async addPendingTransaction(tx: BitcoinTransaction): Promise<void> {
		this.transactions.push(tx);
		await this.persistState();

		this.emitEvent({
			type: 'transaction',
			data: tx,
			timestamp: new Date()
		});
	}

	private emitEvent(event: WalletEvent): void {
		this.eventCallbacks.forEach((callback) => {
			try {
				callback(event);
			} catch (error) {
				console.error('Error in wallet event callback:', error);
			}
		});
	}

	// TODO: Implement get mnemonic
	private getMnemonic(): string | null {
		// This would return the stored mnemonic
		// Implementation depends on storage method
		return null;
	}

	private async persistState(): Promise<void> {
		try {
			const state = {
				addresses: Array.from(this.addresses.entries()),
				transactions: this.transactions,
				utxos: this.utxos,
				currentIndex: this.currentIndex
			};

			localStorage.setItem(
				'bitcoin_wallet_state',
				JSON.stringify(state, (key, value) => {
					if (value instanceof Date) {
						return value.toISOString();
					}
					return value;
				})
			);
		} catch (error) {
			console.error('Failed to persist wallet state:', error);
		}
	}

	private async loadPersistedState(): Promise<void> {
		try {
			const stateData = localStorage.getItem('bitcoin_wallet_state');
			if (stateData) {
				const state = JSON.parse(stateData, (key, value) => {
					if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
						return new Date(value);
					}
					return value;
				});

				this.addresses = new Map(state.addresses || []);
				this.transactions = state.transactions || [];
				this.utxos = state.utxos || [];
				this.currentIndex = state.currentIndex || 0;
			}
		} catch (error) {
			console.error('Failed to load persisted wallet state:', error);
		}
	}
}

/**
 * Create Bitcoin wallet instance
 */
export function createBitcoinWallet(config: Partial<BitcoinWalletConfig> = {}): BitcoinWallet {
	const defaultConfig: BitcoinWalletConfig = {
		network: (import.meta?.env?.VITE_WALLET_NETWORK as 'mainnet' | 'testnet') ?? 'testnet',
		derivationPath: "m/84'/0'/0'/0",
		...config
	};

	return new BitcoinWallet(defaultConfig);
}

import { get } from 'svelte/store';
import { walletStore, state, isRgbWalletReady } from './wallet-state';
import {
	initialize,
	disconnectWallet,
	softCleanup,
	markExpectingInbound,
	getRgbAddress
} from './wallet-init';
import { loadAssets } from './wallet-balances';
import { loadTransactions } from './wallet-transactions';
import { sendBtc, type SendBtcParams } from './wallet-send';
import { releaseWalletMutex } from '$lib/services/rgb/wasm-backend';
import { isNativeBitcoinAsset } from '$lib/types/rgb-contract';
import type { RgbAsset } from './wallet-types';

export const walletManager = {
	async initialize(): Promise<void> {
		return initialize();
	},

	cleanup(): void {
		disconnectWallet();
	},

	softCleanup(): void {
		softCleanup();
	},

	async loadAssets(): Promise<void> {
		return loadAssets();
	},

	async loadTransactions(): Promise<void> {
		return loadTransactions();
	},

	async getRgbAddress(): Promise<string> {
		return getRgbAddress();
	},

	getBtcBalanceSats(): number {
		const store = get(walletStore);
		return store.rgb?.balanceSats ?? store.wdk?.btcOnchain?.balanceSats ?? 0;
	},

	getRgbAssetBalance(assetId: string): RgbAsset | null {
		const store = get(walletStore);
		return store.rgb?.assets?.find((a) => a.assetId === assetId) ?? null;
	},

	getRgbAssets(): RgbAsset[] {
		const store = get(walletStore);
		return store.rgb?.assets ?? [];
	},

	async sendBtc(params: SendBtcParams): Promise<string> {
		return sendBtc(params);
	},

	async receiveRgbInvoice(params: {
		amount: number;
		assetId: string;
		witness?: boolean;
		minConfirmations?: number;
		durationSeconds?: number;
	}): Promise<{ invoice: string; recipientId: string; expirationTimestamp: number | null }> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		const receiveParams = {
			amount: params.amount,
			witness: params.witness !== false,
			...(params.minConfirmations === undefined
				? {}
				: { minConfirmations: params.minConfirmations }),
			...(params.durationSeconds === undefined ? {} : { durationSeconds: params.durationSeconds }),
			...(isNativeBitcoinAsset(params.assetId) ? {} : { assetId: params.assetId })
		};
		const receive =
			typeof wallet.onchainReceive === 'function'
				? await wallet.onchainReceive(receiveParams)
				: receiveParams.witness === false
					? await wallet.blindReceive(receiveParams)
					: await wallet.witnessReceive(receiveParams);
		return {
			invoice: receive.invoice,
			recipientId: receive.recipientId,
			expirationTimestamp: receive.expirationTimestamp
		};
	},

	async releaseRgbLock(): Promise<void> {
		const wallet = state.utexoWallet;
		if (!wallet) return;
		await releaseWalletMutex(wallet);
	},

	async sendRgbAsset(params: {
		invoice: string;
		assetId: string;
		amount?: number;
	}): Promise<{ txid: string; batchTransferIdx: number }> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		return wallet.onchainSend({
			invoice: params.invoice,
			...(params.amount === undefined ? {} : { amount: params.amount }),
			...(isNativeBitcoinAsset(params.assetId) ? {} : { assetId: params.assetId })
		});
	},

	async createLightningInvoice(params: {
		amountSats: number;
		expirySeconds?: number;
	}): Promise<{ lnInvoice: string; requestId?: string }> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		return wallet.createLightningInvoice(params);
	},

	async payLightningInvoice(params: {
		lnInvoice: string;
	}): Promise<{ txid: string; status: string }> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		const result = await wallet.payLightningInvoice(params);
		return { txid: result.txid, status: result.status ?? 'unknown' };
	},

	async createHodlInvoice(params: {
		amountSats: number;
		paymentHash: string;
		expirySeconds?: number;
	}): Promise<{ invoice: string; paymentHash: string }> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		const result = await wallet.createHodlInvoice({
			amtMsat: BigInt(params.amountSats) * 1000n,
			paymentHash: params.paymentHash,
			expirySec: params.expirySeconds ?? 3600
		});
		return { invoice: result.invoice, paymentHash: result.paymentHash };
	},

	async claimHodlInvoice(paymentHash: string, preimage: string): Promise<void> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		await wallet.claimHodlInvoice(paymentHash, preimage);
	},

	async cancelHodlInvoice(paymentHash: string): Promise<void> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		await wallet.cancelHodlInvoice(paymentHash);
	},

	async listChannels(): Promise<unknown[]> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		return wallet.listChannels();
	},

	async openChannel(params: {
		peerPubkey: string;
		capacitySat: number;
		isPublic: boolean;
		assetId?: string;
		assetLocalAmount?: number;
	}): Promise<{ temporaryChannelId: string }> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		return wallet.openChannel(params);
	},

	async closeChannel(params: {
		channelId: string;
		peerPubkey: string;
		force?: boolean;
	}): Promise<void> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		await wallet.closeChannel(params.channelId, params.peerPubkey, params.force ?? false);
	},

	isReady(): boolean {
		return isRgbWalletReady();
	},

	isInitializing(): boolean {
		return get(walletStore).isInitializing;
	},

	getState() {
		return get(walletStore);
	},

	markExpectingInbound(ttlMs?: number): void {
		markExpectingInbound(ttlMs);
	},

	async refreshBalances(): Promise<void> {
		return loadAssets();
	}
};

import { get } from 'svelte/store';
import { walletStore, state, isRgbWalletReady } from './wallet-state';
import {
	initialize,
	unlockWallet,
	disconnectWallet,
	softCleanup,
	markExpectingInbound,
	getRgbAddress
} from './wallet-init';
import { flushWalletState, loadAssets } from './wallet-balances';
import { loadTransactions } from './wallet-transactions';
import {
	pendingReceiveCount,
	quoteSpendable,
	rgbSendBlock as blockRgbSend,
	sendBtc,
	sendRgbAsset as payRgbInvoice,
	type RgbSendHold,
	type SendBtcParams
} from './wallet-send';
import { releaseWalletMutex } from '$lib/services/rgb/wasm-backend';
import { isNativeBitcoinAsset, type SpendableNia } from '$lib/types/rgb-contract';
import { receiveWithAllocations } from './rgb-allocations';
import type { RgbAsset } from './wallet-types';
import { requirePasskeyApproval } from '$lib/utils/helpers/passkey-approval';

export const walletManager = {
	async initialize(options?: { skipLsp?: boolean }): Promise<void> {
		return initialize(options);
	},

	async unlock(signal?: AbortSignal): Promise<void> {
		return unlockWallet(signal);
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

	async listRgbAssets(): Promise<{ ifa: SpendableNia[] }> {
		const wallet = state.utexoWallet;
		if (!wallet) return { ifa: [] };
		const listed = await wallet.listAssets();
		return {
			ifa: (listed.ifa ?? []).map((row) => {
				const balance = row.balance as { spendable?: number; settled?: number } | undefined;
				return {
					assetId: row.assetId,
					ticker: row.ticker,
					balance: { spendable: balance?.spendable, settled: balance?.settled }
				};
			})
		};
	},

	async sendBtc(params: SendBtcParams): Promise<string> {
		await requirePasskeyApproval();
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
		const receive = await receiveWithAllocations(wallet, () =>
			typeof wallet.onchainReceive === 'function'
				? wallet.onchainReceive(receiveParams)
				: receiveParams.witness === false
					? wallet.blindReceive(receiveParams)
					: wallet.witnessReceive(receiveParams)
		);
		await flushWalletState(wallet);
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

	async quoteSpendable(assetId: string): Promise<number> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		return quoteSpendable(wallet, assetId);
	},

	async rgbSendBlock(assetId: string, spendable: number, amount: number): Promise<RgbSendHold> {
		const wallet = state.utexoWallet;
		if (!wallet) return '';
		return blockRgbSend(wallet, assetId, spendable, amount);
	},

	async pendingReceives(assetId?: string): Promise<number> {
		const wallet = state.utexoWallet;
		if (!wallet?.listTransfers) return 0;
		const rows = await wallet.listTransfers(assetId);
		return pendingReceiveCount(rows);
	},

	async sendRgbAsset(params: {
		invoice: string;
		assetId: string;
		amount?: number;
		onProgress?: (step: 'change-coin') => void;
		acceptStuckChange?: boolean;
	}): Promise<{ txid: string; batchTransferIdx: number }> {
		await requirePasskeyApproval();
		return payRgbInvoice(params);
	},

	async createLightningInvoice(params: {
		amountSats?: number;
		expirySeconds?: number;
		asset?: { assetId: string; amount: number };
	}): Promise<{ lnInvoice: string; requestId?: string }> {
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		if (typeof wallet.createLightningInvoice !== 'function') {
			throw new Error('Lightning not ready');
		}
		try {
			return await wallet.createLightningInvoice(params);
		} catch (error) {
			if (error instanceof TypeError) throw new Error('Lightning not ready');
			throw error;
		}
	},

	async payLightningInvoice(params: {
		lnInvoice: string;
		assetId?: string;
		assetAmount?: number;
	}): Promise<{ txid: string; status: string; paymentHash?: string; preimage?: string }> {
		await requirePasskeyApproval();
		const wallet = state.utexoWallet;
		if (!wallet) throw new Error('RGB wallet is not initialized.');
		const result = await wallet.payLightningInvoice(params);
		const extra = result as { paymentHash?: unknown; preimage?: unknown };
		return {
			txid: result.txid,
			status: result.status ?? 'unknown',
			...(typeof extra.paymentHash === 'string' ? { paymentHash: extra.paymentHash } : {}),
			...(typeof extra.preimage === 'string' ? { preimage: extra.preimage } : {})
		};
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

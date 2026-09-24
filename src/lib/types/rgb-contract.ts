/**
 * Types for UTEXO SDK powered RGB contract settlement rails.
 */

export type ContractPaymentAsset = 'usdt_rgb' | 'btc_onchain' | 'btc_lightning';

export const CONTRACT_PAYMENT_ASSETS: Record<ContractPaymentAsset, string> = {
	btc_onchain: 'Bitcoin',
	btc_lightning: 'Lightning',
	usdt_rgb: 'USDT'
};

const NATIVE_BITCOIN_IDS = new Set(['', 'BTC', 'btc', 'bitcoin', 'btc_onchain', 'btc_lightning']);

/** UTEXO `onchainReceive` / `onchainSend` omit `assetId` for native BTC. */
export function isNativeBitcoinAsset(assetId: string | null | undefined): boolean {
	if (assetId == null) return true;
	return NATIVE_BITCOIN_IDS.has(assetId.trim());
}

const REJECTED_RGB_USDT_PREFIX = 'rgb:2s69152';
const HEX_64 = /^[0-9a-fA-F]{64}$/;

/** Configured RGB USDT id, or null when unset or not safe to pass into the wallet. */
export function getConfiguredRgbUsdtAssetId(): string | null {
	const assetId = (import.meta.env.VITE_RGB_USDT_ASSET_ID as string | undefined)?.trim() ?? '';
	if (!assetId || assetId.startsWith(REJECTED_RGB_USDT_PREFIX) || HEX_64.test(assetId)) {
		return null;
	}
	return assetId;
}

export interface PaymentSplitConfig {
	primaryAsset: ContractPaymentAsset;
	primaryPercentage: number; // e.g., 95
	secondaryAsset: ContractPaymentAsset;
	secondaryPercentage: number; // e.g., 5
	secondaryPayoutAddress?: string; // App wallet address or custom cold storage bc1q...
}

export interface RgbInvoiceContractSpec {
	contractId: string;
	totalAmountUsd: number;
	split: PaymentSplitConfig;
	primaryInvoice: string; // RGB Asset Invoice / Consignment
	secondaryInvoice: string; // BTC On-Chain Address / Lightning Invoice
	status: 'draft' | 'pending_deposit' | 'active' | 'completed' | 'disputed';
}

/**
 * Types for UTEXO SDK powered RGB contract settlement rails.
 */

export type ContractPaymentAsset = 'usdt_rgb' | 'btc_onchain' | 'btc_lightning';

export const CONTRACT_PAYMENT_ASSETS: Record<ContractPaymentAsset, string> = {
	btc_onchain: 'Bitcoin',
	btc_lightning: 'Lightning',
	usdt_rgb: 'USDT'
};

export function getConfiguredRgbUsdtAssetId(): string {
	const assetId = import.meta.env.VITE_RGB_USDT_ASSET_ID as string | undefined;
	if (!assetId?.trim()) {
		throw new Error('VITE_RGB_USDT_ASSET_ID is required for RGB USDT payments.');
	}
	return assetId.trim();
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

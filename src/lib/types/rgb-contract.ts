/**
 * Types for native Bitcoin/RGB contract settlement splits.
 */

export type ContractPaymentAsset = 'usdt_rgb' | 'btc_onchain' | 'btc_lightning';

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

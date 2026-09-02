/**
 * Types for a future RGB/Bitcoin dual-currency settlement split.
 *
 * Not wired to any creation flow yet — no RGB or Lightning SDK is installed
 * (see wallet-init.ts), so nothing can build or settle an `RgbInvoiceContractSpec`
 * today. This file only reserves the shape for when that backend exists.
 */

export interface PaymentSplitConfig {
	primaryAsset: 'usdt_rgb' | 'btc_onchain';
	primaryPercentage: number; // e.g., 95
	secondaryAsset: 'btc_onchain' | 'btc_lightning';
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

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

export interface SpendableNia {
	ticker?: string;
	assetId?: string;
	precision?: number;
	balance?: { spendable?: number };
}

/** USDT base units for a bid priced in dollars. Never the whole wallet. */
export function usdtEscrowUnits(amountUsd: number, precision: number, spendable: number): number {
	if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
		throw new Error('Bid amount cannot be converted to USDT');
	}
	if (!Number.isInteger(precision) || precision < 0 || precision > 18) {
		throw new Error('USDT precision is not valid');
	}
	const units = Math.round(amountUsd * 10 ** precision);
	if (!Number.isSafeInteger(units) || units <= 0) {
		throw new Error('Bid amount cannot be converted to USDT');
	}
	if (units > spendable) {
		throw new Error('Not enough USDT to fund this escrow');
	}
	return units;
}

export function usdtPrecision(ticker: string | undefined, precision: number | undefined): number {
	if (
		typeof precision === 'number' &&
		Number.isInteger(precision) &&
		precision >= 0 &&
		precision <= 18
	) {
		return precision;
	}
	return (ticker ?? '').toUpperCase() === 'USDT' ? 6 : 0;
}

export function escrowSendAmount(input: {
	spendable: number;
	totalAmountUsd: number;
	precision: number;
	fullSpendable: boolean;
}): number {
	if (!Number.isFinite(input.spendable) || input.spendable <= 0) {
		throw new Error('No spendable RGB balance to fund escrow');
	}
	if (input.fullSpendable) return input.spendable;
	return usdtEscrowUnits(input.totalAmountUsd, input.precision, input.spendable);
}

function heldSpendable(
	nia: readonly SpendableNia[],
	assetId: string | null | undefined
): string | undefined {
	const id = assetId?.trim();
	if (!id) return undefined;
	const row = nia.find((item) => item.assetId === id);
	const spendable = Number(row?.balance?.spendable ?? 0);
	return Number.isFinite(spendable) && spendable > 0 ? id : undefined;
}

/** True when this wallet's NIA list already contains the contract. */
export function listsRgbAsset(
	nia: readonly { assetId?: string }[] | undefined,
	assetId: string | null | undefined
): boolean {
	const id = assetId?.trim();
	if (!id) return false;
	return (nia ?? []).some((row) => row.assetId === id);
}

/** NIA and IFA rows. UTEXO Signet USDT is IFA, not NIA. */
export function spendableRgbAssets(
	listed:
		| {
				nia?: readonly SpendableNia[] | null;
				ifa?: readonly SpendableNia[] | null;
		  }
		| null
		| undefined
): SpendableNia[] {
	return [...(listed?.nia ?? []), ...(listed?.ifa ?? [])];
}

/** First preferred id that this wallet can spend, then USDT, then any spendable row. */
export function selectEscrowAsset(
	nia: readonly SpendableNia[],
	preferredIds: readonly (string | null | undefined)[] = []
): string | undefined {
	for (const id of preferredIds) {
		const held = heldSpendable(nia, id);
		if (held) return held;
	}
	const usdt = heldSpendable(nia, nia.find((item) => item.ticker === 'USDT')?.assetId);
	if (usdt) return usdt;
	for (const item of nia) {
		const held = heldSpendable(nia, item.assetId);
		if (held) return held;
	}
	return undefined;
}

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

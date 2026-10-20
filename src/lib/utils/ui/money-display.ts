import { formatInteger, formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';

export type DisplayCurrency = 'USDT' | 'USD' | 'SATS';

export type QuotedAmount = {
	amount: number;
	currency?: string | null;
	/** Present on bids. Never used as the displayed figure. */
	taskBudget?: { amount?: number; currency?: string } | null;
};

export type ContractAmount = {
	lockedAmount: number;
	lockedCurrency?: string | null;
	totalAmountUsd: number;
	primaryAsset?: string | null;
};

const SATS_CODES = new Set(['SATS', 'SAT', 'Satoshi', 'BTC']);

export function normalizeDisplayCurrency(currency: string | null | undefined): DisplayCurrency {
	const code = (currency ?? 'USD').trim().toUpperCase();
	if (SATS_CODES.has(code)) return 'SATS';
	if (code === 'USDT' || code === 'USD₮') return 'USDT';
	return 'USD';
}

export function formatMoneyAmount(amount: number, currency: string | null | undefined): string {
	if (!Number.isFinite(amount)) return 'Amount unavailable';
	const code = normalizeDisplayCurrency(currency);
	if (code === 'SATS') return `${formatInteger(amount)} sats`;
	if (code === 'USDT') return `${formatNumberWithTwoDecimals(amount)} USDT`;
	return `$${formatNumberWithTwoDecimals(amount)} USD`;
}

/**
 * The bid or quote the person submitted.
 * `taskBudget` is ignored so a task budget cannot stand in for the bid.
 */
export function bidAmountLabel(quote: QuotedAmount): string {
	return formatMoneyAmount(quote.amount, quote.currency);
}

/** Agreed contract figure. Prefers the locked bid amount over `totalAmountUsd`. */
export function contractDisplayAmount(input: ContractAmount): string {
	const asset = (input.primaryAsset ?? '').toLowerCase();
	const currency = normalizeDisplayCurrency(input.lockedCurrency);
	const locked =
		Number.isFinite(input.lockedAmount) && input.lockedAmount > 0 ? input.lockedAmount : 0;
	const fallback =
		Number.isFinite(input.totalAmountUsd) && input.totalAmountUsd > 0 ? input.totalAmountUsd : 0;
	const amount = locked || fallback;
	if (!amount) return 'Amount unavailable';

	if (currency === 'SATS' || asset === 'btc_onchain' || asset === 'btc_lightning') {
		if (currency === 'SATS') return formatMoneyAmount(amount, 'SATS');
		return formatMoneyAmount(amount, 'USD');
	}
	if (asset.startsWith('usdt') || currency === 'USDT') return formatMoneyAmount(amount, 'USDT');
	return formatMoneyAmount(amount, 'USD');
}

/** On-chain units for the agreed amount. Dollar amounts use USDT base units (6 decimals). */
export function contractPayUnits(input: ContractAmount): number {
	const currency = normalizeDisplayCurrency(input.lockedCurrency);
	const locked =
		Number.isFinite(input.lockedAmount) && input.lockedAmount > 0 ? input.lockedAmount : 0;
	if (currency === 'SATS' && locked) return Math.max(1, Math.round(locked));
	const dollars = locked || (Number.isFinite(input.totalAmountUsd) ? input.totalAmountUsd : 0);
	return Math.max(1, Math.round(dollars * 1_000_000));
}

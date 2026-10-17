export type WalletChip = 'ready' | 'getting_ready' | 'offline';
export type PaymentRail = 'btc_onchain' | 'btc_lightning' | 'usdt_rgb' | 'usdt_ln';

export function walletChip(input: {
	locked: boolean;
	syncing: boolean;
	initializing: boolean;
	connected: boolean;
	hasError: boolean;
}): WalletChip {
	if (input.locked || input.syncing || input.initializing) return 'getting_ready';
	if (input.hasError || !input.connected) return 'offline';
	return 'ready';
}

export function combinedSats(onchain: number, lightning: number): number {
	const chain = Number.isFinite(onchain) ? Math.max(0, onchain) : 0;
	const channel = Number.isFinite(lightning) ? Math.max(0, lightning) : 0;
	return chain + channel;
}

/** Spendable USDT when it is funded. A zero spendable field must not hide settled USDT. */
export function heldUsdt(
	asset: { spendable?: number | null; balance?: number | null } | null,
	fallback: number,
	lightning: number
): number {
	const spendable = asset?.spendable;
	const balance = asset?.balance;
	const chain =
		typeof spendable === 'number' && spendable > 0
			? spendable
			: typeof balance === 'number' && Number.isFinite(balance) && balance > 0
				? balance
				: Number.isFinite(fallback)
					? Math.max(0, fallback)
					: 0;
	const channel = Number.isFinite(lightning) ? Math.max(0, lightning) : 0;
	return chain + channel;
}

export function isUsdtHistory(
	description: string | undefined,
	assetUnits: number | undefined
): boolean {
	if ((description ?? '').toLowerCase().includes('rgb')) return true;
	return typeof assetUnits === 'number' && Number.isFinite(assetUnits) && assetUnits > 0;
}

export function usdFromSats(sats: number, btcUsd: number): number | null {
	if (!Number.isFinite(sats) || sats < 0 || !Number.isFinite(btcUsd) || btcUsd <= 0) return null;
	return (sats / 100_000_000) * btcUsd;
}

export function formatUsd(amount: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/** Rough on-chain fee for the confirm screen. Not a quote from the wallet. */
export function feeEstimateSats(feeRate: number): number {
	const rate = Number.isFinite(feeRate) ? Math.max(1, feeRate) : 1;
	return rate * 200;
}

export function detectPayment(value: string): PaymentRail | null {
	const text = value.trim();
	if (!text) return null;
	if (text.startsWith('rgb:')) return 'usdt_rgb';
	if (/^ln/i.test(text)) return 'btc_lightning';
	if (/^(bc1|tb1|bcrt1)/i.test(text)) return 'btc_onchain';
	if (text.startsWith('npub') || text.includes('@')) return 'btc_lightning';
	return null;
}

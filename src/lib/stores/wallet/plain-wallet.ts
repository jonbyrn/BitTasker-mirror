export type WalletChip = 'ready' | 'getting_ready' | 'locked' | 'offline';
export type PaymentRail = 'btc_onchain' | 'btc_lightning' | 'usdt_rgb' | 'usdt_ln';

export function walletChip(input: {
	locked: boolean;
	syncing: boolean;
	initializing: boolean;
	connected: boolean;
	hasError: boolean;
}): WalletChip {
	if (input.locked) return 'locked';
	if (input.connected && !input.hasError) return 'ready';
	if (input.syncing || input.initializing) return 'getting_ready';
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

/** The one number on screen: Esplora-live USDT when the check succeeded. */
export function shownUsdt(
	asset: {
		spendable?: number | null;
		balance?: number | null;
		chainSpendable?: number | null;
		chainUnknown?: boolean;
	} | null,
	fallback: number,
	lightning: number
): number {
	const channel = Number.isFinite(lightning) ? Math.max(0, lightning) : 0;
	const live = asset?.chainSpendable;
	if (asset && asset.chainUnknown !== true && typeof live === 'number' && Number.isFinite(live)) {
		return Math.max(0, live) + channel;
	}
	return heldUsdt(asset, fallback, lightning);
}

export function spendCapText(amount: string): string {
	return `You have $${amount} USDT. You can send up to $${amount}.`;
}

/** Hours left on a payment code. Zero means it has already expired. */
export function expiryHours(unixSeconds: number | null, nowMs = Date.now()): number | null {
	if (unixSeconds === null || !Number.isFinite(unixSeconds) || unixSeconds <= 0) return null;
	const left = unixSeconds * 1000 - nowMs;
	if (left <= 0) return 0;
	return Math.ceil(left / 3_600_000);
}

/** Simple mode never shows engine text. The raw message stays in the console. */
export function plainSendReason(message: string): string {
	const text = message.toLowerCase();
	if (text.includes('come back')) {
		return 'The rest of the dollars would not come back. Nothing was sent.';
	}
	if (text.includes('blank invoice')) {
		return 'Your dollars are still held by an old receive code. Cancel it and try again.';
	}
	if (text.includes('expired')) return 'This payment code has expired, ask for a new one';
	if (
		text.includes('not enough') ||
		text.includes('larger than') ||
		text.includes('spendable') ||
		text.includes('only ')
	) {
		return 'Not enough USDT';
	}
	if (
		text.includes('nothing was sent') ||
		text.includes('timed out') ||
		text.includes('no connection') ||
		text.includes('offline') ||
		/bdk|utxo|seal|onchainsend|rgb:/.test(text)
	) {
		return 'No connection, nothing was sent, try again';
	}
	return message;
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

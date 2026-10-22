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

/**
 * A scan that returns 0 while the wallet is still syncing is not a real empty balance.
 * Keep the last positive figure until a scan finishes outside of sync.
 */
export function satsForDisplay(current: number, lastKnown: number, syncing: boolean): number {
	const known = Number.isFinite(lastKnown) && lastKnown > 0 ? lastKnown : 0;
	const value = Number.isFinite(current) ? Math.max(0, current) : 0;
	if (syncing && value === 0 && known > 0) return known;
	return value;
}

function wholeUnits(value: number | null | undefined): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Spendable when it is funded.
 * After a partial send, rgb-lib leaves the old total in `settled` and the change in `future`.
 * A zero spendable field must not hide settled USDT when future is not a smaller remainder.
 */
export function bookedUsdt(
	balance:
		| { spendable?: number | null; settled?: number | null; future?: number | null }
		| null
		| undefined
): number {
	const spendable = wholeUnits(balance?.spendable);
	const settled = wholeUnits(balance?.settled);
	const future = wholeUnits(balance?.future);
	if (spendable > 0) return spendable;
	if (future > 0 && settled > future) return future;
	if (settled > 0) return settled;
	return future;
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
		settled?: number | null;
		future?: number | null;
		chainSpendable?: number | null;
		chainSpent?: number | null;
		chainUnknown?: boolean;
		/** Paid units whose output is not already in the live or spent set. */
		incomingUnits?: number | null;
	} | null,
	fallback: number,
	lightning: number
): number {
	const channel = Number.isFinite(lightning) ? Math.max(0, lightning) : 0;
	const incoming = wholeUnits(asset?.incomingUnits);
	const live = asset?.chainSpendable;
	if (asset && asset.chainUnknown !== true && typeof live === 'number' && Number.isFinite(live)) {
		if (live > 0) {
			// A spent allocation still sitting in the engine must not be added again.
			const extra = wholeUnits(asset.chainSpent) > 0 ? 0 : incoming;
			return live + extra + channel;
		}
		if (wholeUnits(asset.chainSpent) > 0) return incoming + channel;
	}
	const booked = heldUsdt(asset, fallback, 0);
	return Math.max(booked, incoming) + channel;
}

/** Units sitting on outputs the chain already spent. Zero when the check did not prove that. */
export function lockedUnits(
	asset: {
		chainSpendable?: number | null;
		chainSpent?: number | null;
		chainUnknown?: boolean;
	} | null
): number {
	if (!asset || asset.chainUnknown === true) return 0;
	const live = asset.chainSpendable;
	if (typeof live !== 'number' || !Number.isFinite(live) || live > 0) return 0;
	return wholeUnits(asset.chainSpent);
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
	if (
		text.includes('passkey') ||
		text.includes('unlock cancelled') ||
		text.includes('operation either timed out or was not allowed')
	) {
		return 'Passkey approval timed out or was cancelled. Your entries are still here. Tap Retry.';
	}
	if (text.includes('leaves the rest stuck')) {
		return 'Send the full dollar amount. A smaller send would leave the rest stuck. Nothing was sent.';
	}
	if (text.includes('add a little bitcoin so the rest') || text.includes('no uncolored fee utxo')) {
		return 'Add a little bitcoin so the rest of your dollars can stay in this wallet. Nothing was sent.';
	}
	if (text.includes('come back') || text.includes('fee must stay within the fee rate')) {
		return 'The network fee was too high, so nothing was sent.';
	}
	if (text.includes('blank invoice')) {
		return 'Your dollars are still held by an old receive code. Cancel it and try again.';
	}
	if (text.includes('expired')) return 'This payment code has expired, ask for a new one';
	if (text.includes('locked or unconfirmed')) return message;
	if (
		text.includes('not enough') ||
		text.includes('larger than') ||
		text.includes('spendable') ||
		text.includes('only ')
	) {
		return 'Not enough USDT';
	}
	if (
		text.includes('no connection') ||
		text.includes('offline') ||
		text.includes('failed to fetch')
	) {
		return 'Connection problem: No connection. Nothing was sent.';
	}
	if (
		text.includes('nothing was sent') ||
		text.includes('timed out') ||
		text.includes('not configured') ||
		text.includes('not registered') ||
		/\brgb\b/.test(text) ||
		/bdk|utxo|seal|onchainsend|rgb:/.test(text)
	) {
		return 'The payment did not send. Nothing left the wallet. Tap Retry.';
	}
	return message;
}

/**
 * Settlement failures stay in plain language.
 * The raw engine text is logged by the caller; this is what Confirm payment shows.
 */
export function settlementSendReason(message: string): string {
	const text = message.toLowerCase();
	if (
		text.includes('passkey') ||
		text.includes('unlock cancelled') ||
		text.includes('operation either timed out or was not allowed')
	) {
		return 'Passkey approval timed out or was cancelled. Nothing was sent.';
	}
	if (text.includes('not initialized') || text.includes('wallet is locked')) {
		return 'The wallet is locked. Unlock it and try again. Nothing was sent.';
	}
	if (text.includes('blank invoice')) {
		return 'Your dollars are still held by an old receive code. Cancel it and try again.';
	}
	if (text.includes('add a little bitcoin so the rest') || text.includes('leaves the rest stuck')) {
		return 'Add a little bitcoin so the rest of your dollars can stay in this wallet. Nothing was sent.';
	}
	if (text.includes('come back') || text.includes('fee must stay within the fee rate')) {
		return 'The network fee was too high, so nothing was sent.';
	}
	if (text.includes('invoice') && (text.includes('requires') || text.includes('does not match'))) {
		return 'This payment code does not match the contract. Ask for a new one. Nothing was sent.';
	}
	if (
		text.includes('fee utxo') ||
		text.includes('not enough bitcoin') ||
		text.includes('network fee')
	) {
		return 'Not enough bitcoin for the network fee. Nothing was sent.';
	}
	if (
		text.includes('no colorable') ||
		text.includes('does not match spendable') ||
		text.includes('no seal') ||
		text.includes('does not own')
	) {
		return 'This wallet cannot spend that USDT yet. Nothing was sent.';
	}
	if (
		text.includes('not enough') ||
		text.includes('larger than') ||
		text.includes('only ') ||
		text.includes('spendable')
	) {
		return 'Not enough USDT. Nothing was sent.';
	}
	if (text.includes('already spent') || text.includes('adding utxos')) {
		return 'That USDT output was already spent. Nothing new was sent.';
	}
	if (
		text.includes('no connection') ||
		text.includes('offline') ||
		text.includes('connection failure') ||
		text.includes('failed to fetch') ||
		text.includes('networkerror') ||
		text.includes('network error')
	) {
		return 'The wallet could not reach the network. Nothing was sent.';
	}
	if (text.includes('timed out') || text.includes('stopped before')) {
		return 'The payment stopped before it left this wallet. Nothing was sent.';
	}
	const cleaned = message
		.replace(/rgb:[^\s]+/gi, '')
		.replace(/\b(utxos?|seals?|bdk|onchainsend|consignment|psbt)\b/gi, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (cleaned.length >= 12) return `${cleaned} Nothing was sent.`;
	return 'Nothing was sent. Try again.';
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

/** One total in dollars. Bitcoin joins only when a price is known. */
export function totalInUsd(sats: number, dollars: number, btcUsd: number): number {
	const usd = Number.isFinite(dollars) ? Math.max(0, dollars) : 0;
	const bitcoin = Number.isFinite(sats) ? Math.max(0, sats) : 0;
	return usd + (usdFromSats(bitcoin, btcUsd) ?? 0);
}

/** One total in sats. Dollars join only when a Bitcoin price is known. */
export function totalInSats(sats: number, dollars: number, btcUsd: number): number {
	const base = Number.isFinite(sats) ? Math.max(0, Math.round(sats)) : 0;
	if (!Number.isFinite(dollars) || dollars <= 0 || !(btcUsd > 0)) return base;
	return base + Math.round((dollars / btcUsd) * 100_000_000);
}

/** Main figure is sats. Fiat is null when the price feed has no number. */
export function bitcoinFigures(
	sats: number,
	btcUsd: number
): { satsText: string; fiat: string | null } {
	const numeric = Number.isFinite(sats) ? Math.max(0, Math.round(sats)) : 0;
	const dollars = usdFromSats(numeric, btcUsd);
	return {
		satsText: new Intl.NumberFormat('en-US').format(numeric),
		fiat: dollars === null ? null : formatUsd(dollars)
	};
}

/**
 * Incoming units that are not settled yet. Null when the engine did not say settled is 0.
 * Those units are not spendable, and they are not locked by an open receive.
 */
export function usdtAwaitingSettlement(
	asset: {
		settled?: number | null;
		future?: number | null;
		changeDue?: boolean;
	} | null
): number | null {
	if (asset?.changeDue) return null;
	if (asset?.settled !== 0) return null;
	const future = asset.future;
	if (typeof future !== 'number' || !Number.isFinite(future) || future <= 0) return null;
	return future;
}

/**
 * Dollars locked by an open receive. Null when the wallet did not report both numbers,
 * when nothing is held back from what can be spent, or when the only gap is an
 * unsettled incoming payment (settled is explicitly 0).
 */
export function usdtOnHold(
	asset: {
		spendable?: number | null;
		balance?: number | null;
		settled?: number | null;
		future?: number | null;
		changeDue?: boolean;
	} | null
): { available: number; hold: number } | null {
	if (asset?.changeDue) return null;
	if (usdtAwaitingSettlement(asset) !== null) return null;
	const balance = asset?.balance;
	const spendable = asset?.spendable;
	if (typeof balance !== 'number' || !Number.isFinite(balance) || balance <= 0) return null;
	if (typeof spendable !== 'number' || !Number.isFinite(spendable)) return null;
	const hold = balance - spendable;
	if (!(hold > 0)) return null;
	return { available: Math.max(0, spendable), hold };
}

export type TransferSide = 'btc' | 'usd';
export type TransferPercent = 25 | 50 | 75 | 100;

/** A preview of moving part of one balance into the other. Nothing is sent. */
export function transferQuote(
	from: TransferSide,
	percent: TransferPercent,
	balanceSats: number,
	balanceUsd: number,
	btcUsd: number
): { sats: number; usd: number } | null {
	if (percent !== 25 && percent !== 50 && percent !== 75 && percent !== 100) return null;
	if (from === 'btc') {
		const sats = Math.floor((Math.max(0, balanceSats) * percent) / 100);
		if (sats <= 0) return null;
		return { sats, usd: usdFromSats(sats, btcUsd) ?? 0 };
	}
	if (!(btcUsd > 0)) return null;
	const usd = (Math.max(0, balanceUsd) * percent) / 100;
	if (!(usd > 0)) return null;
	return { sats: Math.max(1, Math.round((usd / btcUsd) * 100_000_000)), usd };
}

export function formatUsd(amount: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/** Rough on-chain fee for the confirm screen. Not a quote from the wallet. */
export function feeEstimateSats(feeRate: number): number {
	const rate = Number.isFinite(feeRate) ? Math.max(1, feeRate) : 1;
	return rate * 200;
}

/** A bitcoin: link keeps the address. Lightning and RGB invoices stay whole. */
export function paymentText(value: string): string {
	const text = value.trim();
	if (/^bitcoin:/i.test(text)) return (text.slice('bitcoin:'.length).split('?')[0] ?? '').trim();
	return text;
}

export function detectPayment(value: string): PaymentRail | null {
	const text = paymentText(value);
	if (!text) return null;
	if (text.startsWith('rgb:')) return 'usdt_rgb';
	if (/^ln/i.test(text)) return 'btc_lightning';
	if (/^(bc1|tb1|bcrt1)/i.test(text)) return 'btc_onchain';
	if (text.startsWith('npub') || text.includes('@')) return 'btc_lightning';
	return null;
}

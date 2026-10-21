import { decodeRgbInvoice } from '$lib/stores/wallet/decode-rgb-invoice';
import type { ContractPaymentAsset } from '$lib/types/rgb-contract';

/** Signet LSP LNUSDT. Fund sends this asset only when a channel lists it as usable. */
export const ESCROW_LNUSDT = 'rgb:vDU5IB7L-ZJFyqM3-5KrG84e-L0Q4kzi-eg3y0nH-JzoBylw';

/** Telegram bot node. Never pay this pubkey. */
const BOT_PAYEE = '023bafd0d9d2a72958ff8332b9a36972152b410c91e332da1716d3f7ea0831b650';

export function isLightningRail(asset: ContractPaymentAsset): boolean {
	return asset === 'btc_lightning';
}

export function isLnUsdtRail(asset: ContractPaymentAsset): boolean {
	return asset === 'usdt_ln';
}

/** Platform fee in the same unit as `amount`. Phase 1 returns 0. */
export function feeHook(_amount: number, _side: 'tasker' | 'taskee'): number {
	return 0;
}

export function isRgbInvoice(invoice: string): boolean {
	const value = invoice.trim();
	return value.startsWith('rgb:') || value.startsWith('rgb1');
}

/** Bolt11 for escrow: ln, lntb, lntbs. Bolt12 offers are not a fund invoice. */
export function isEscrowBolt11(invoice: string): boolean {
	const value = invoice.trim().toLowerCase();
	if (!value.startsWith('ln')) return false;
	if (value.startsWith('lno') || value.startsWith('lnr') || value.startsWith('lni')) return false;
	return true;
}

export function invoiceMatchesRail(asset: ContractPaymentAsset, invoice: string): boolean {
	if (isLightningRail(asset)) return isEscrowBolt11(invoice);
	if (isLnUsdtRail(asset)) return isEscrowBolt11(invoice) || isRgbInvoice(invoice);
	return isRgbInvoice(invoice);
}

/** True when the invoice leaves the amount unset (`~`). The sender fills it in. */
export function invoiceOmitsAmount(invoice: string): boolean {
	const value = invoice.trim();
	if (!value.startsWith('rgb:')) return false;
	try {
		return decodeRgbInvoice(value).amount === null;
	} catch {
		return false;
	}
}

/** True when an RGB invoice states the contract amount. A blank invoice does not. */
export function invoiceMatchesAmount(
	asset: ContractPaymentAsset,
	invoice: string,
	units: number
): boolean {
	if (!Number.isSafeInteger(units) || units <= 0) return false;
	const value = invoice.trim();
	if (!isRgbInvoice(value) || !value.startsWith('rgb:') || isLightningRail(asset)) return false;
	try {
		return decodeRgbInvoice(value).amount === units;
	} catch {
		return false;
	}
}

export function assertInvoiceRail(asset: ContractPaymentAsset, invoice: string): void {
	if (invoiceMatchesRail(asset, invoice)) return;
	if (isLightningRail(asset)) throw new Error('Sats escrow requires a Lightning invoice');
	if (isLnUsdtRail(asset)) {
		throw new Error('LN-USDT escrow requires a Lightning invoice or an rgb: invoice');
	}
	throw new Error('USDT escrow requires an rgb: invoice');
}

export function lnUsdtOpen(channels: unknown): boolean {
	if (!Array.isArray(channels)) return false;
	return channels.some((row) => {
		if (typeof row !== 'object' || row === null) return false;
		const channel = row as { isUsable?: unknown; assetId?: unknown };
		return channel.isUsable === true && channel.assetId === ESCROW_LNUSDT;
	});
}

/** Signet will not route a native Lightning payment under this size. */
export const LIGHTNING_MIN_LOCK_SATS = 3000;

/** True when the Lightning node has neither a peer nor a channel. */
export function lightningNodeEmpty(peers: unknown, channels: unknown): boolean {
	const peerCount = Array.isArray(peers) ? peers.length : 0;
	const channelCount = Array.isArray(channels) ? channels.length : 0;
	return peerCount === 0 && channelCount === 0;
}

export function refusedBotPayee(payee: string | undefined): boolean {
	return payee === BOT_PAYEE;
}

/** True when millisatoshis are exactly the locked sat amount. */
export function bolt11MatchesSats(
	amtMsat: number | bigint | null | undefined,
	sats: number
): boolean {
	if (amtMsat == null || !Number.isSafeInteger(sats) || sats <= 0) return false;
	try {
		const msat = typeof amtMsat === 'bigint' ? amtMsat : BigInt(amtMsat);
		return msat === BigInt(sats) * 1000n;
	} catch {
		return false;
	}
}

/** A usable channel that can carry sats. An LNUSDT channel is not this rail. */
export function satsChannelOpen(channels: unknown): boolean {
	if (!Array.isArray(channels)) return false;
	return channels.some((row) => {
		if (typeof row !== 'object' || row === null) return false;
		const channel = row as { isUsable?: unknown; assetId?: unknown };
		return channel.isUsable === true && channel.assetId !== ESCROW_LNUSDT;
	});
}

/**
 * Sat amounts a Lightning escrow may pay against one locked total.
 * The lock is the fee, raised to the network minimum when that still fits the total.
 * The balance is whatever remains of that total.
 */
export function escrowStageSats(lockedSats: number): number[] {
	if (!Number.isSafeInteger(lockedSats) || lockedSats <= 0) return [];
	const fee = feeHook(lockedSats, 'tasker');
	const quote = Math.max(0, lockedSats - fee);
	const amounts = [lockedSats, fee, quote, Math.max(0, quote - fee)];
	for (const total of [lockedSats, quote]) {
		if (total <= 0) continue;
		const lock = Math.min(total, Math.max(fee, LIGHTNING_MIN_LOCK_SATS));
		amounts.push(lock, total - lock);
	}
	return [...new Set(amounts.filter((sats) => sats > 0))];
}

export function bolt11Expired(
	timestamp: number | undefined,
	expirySeconds: number | undefined,
	nowSec: number
): boolean {
	if (expirySeconds == null || !Number.isFinite(expirySeconds) || expirySeconds < 0) return true;
	// The wallet decoder omits the invoice creation time. Expiry is checked only when it is present.
	if (timestamp == null || !Number.isFinite(timestamp)) return false;
	return timestamp + expirySeconds <= nowSec;
}

interface NodeWallet {
	listPeers?: () => Promise<unknown>;
	listChannels?: () => Promise<unknown>;
}

/** True when sats Fund must stay disabled. */
export async function satsRailBlocked(wallet: NodeWallet | null): Promise<boolean> {
	if (!wallet?.listPeers || !wallet.listChannels) return true;
	try {
		const channels = await wallet.listChannels();
		return !satsChannelOpen(channels);
	} catch {
		return true;
	}
}

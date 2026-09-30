import type { ContractPaymentAsset } from '$lib/types/rgb-contract';

/** Signet LSP LNUSDT. Fund sends this asset only when a channel lists it as usable. */
export const ESCROW_LNUSDT = 'rgb:vDU5IB7L-ZJFyqM3-5KrG84e-L0Q4kzi-eg3y0nH-JzoBylw';

/** Telegram bot node. Never pay this pubkey. */
const BOT_PAYEE = '023bafd0d9d2a72958ff8332b9a36972152b410c91e332da1716d3f7ea0831b650';

export function isLightningRail(asset: ContractPaymentAsset): boolean {
	return asset === 'btc_lightning';
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
	return isRgbInvoice(invoice);
}

export function assertInvoiceRail(asset: ContractPaymentAsset, invoice: string): void {
	if (invoiceMatchesRail(asset, invoice)) return;
	if (isLightningRail(asset)) throw new Error('Sats escrow requires a Lightning invoice');
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

export function bolt11Expired(
	timestamp: number | undefined,
	expirySeconds: number | undefined,
	nowSec: number
): boolean {
	if (timestamp == null || expirySeconds == null) return true;
	if (!Number.isFinite(timestamp) || !Number.isFinite(expirySeconds) || expirySeconds < 0) {
		return true;
	}
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
		const [peers, channels] = await Promise.all([wallet.listPeers(), wallet.listChannels()]);
		return lightningNodeEmpty(peers, channels);
	} catch {
		return true;
	}
}

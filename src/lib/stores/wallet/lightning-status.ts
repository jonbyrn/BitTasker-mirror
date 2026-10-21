import { BOT_LSP_PUBKEY } from './signet-lsp';

/** Hosted Signet LSP opens about this many sats. The client does not choose it and does not have to hold it. */
export const HOSTED_LSP_CHANNEL_SATS = 200_000;

/** On-chain sats this wallet needs for fees. A hosted channel is not funded from this balance. */
export const LIGHTNING_ONCHAIN_RESERVE_SATS = 10_000;

/** Smallest self-funded channel the advanced form will submit. */
export const MIN_MANUAL_CHANNEL_SATS = 20_000;

export type LightningUxStatus = 'setting_up' | 'ready' | 'needs_funding' | 'failed';

export type LightningFailure = '' | 'attach' | 'connect' | 'channel' | 'tab';

export function lightningUxStatus(input: {
	ready: boolean;
	channel: 'idle' | 'waiting' | 'open' | 'missing';
	onchainSats: number;
	failure?: LightningFailure;
}): { status: LightningUxStatus; satsNeeded: number } {
	if (input.ready || input.channel === 'open') return { status: 'ready', satsNeeded: 0 };
	if (input.failure || input.channel === 'missing') return { status: 'failed', satsNeeded: 0 };
	const onchain = Number.isFinite(input.onchainSats)
		? Math.max(0, Math.floor(input.onchainSats))
		: 0;
	const satsNeeded = Math.max(0, LIGHTNING_ONCHAIN_RESERVE_SATS - onchain);
	if (satsNeeded > 0) return { status: 'needs_funding', satsNeeded };
	return { status: 'setting_up', satsNeeded: 0 };
}

export interface ChannelBalanceSnapshot {
	btcSats: number;
	usdtUnits: number;
}

/** On-channel balances. Missing fields count as zero. This does not touch on-chain UTXOs. */
export function summarizeChannelBalances(
	channels: unknown,
	usdtAssetId: string
): ChannelBalanceSnapshot {
	if (!Array.isArray(channels)) return { btcSats: 0, usdtUnits: 0 };
	let btcMsat = 0;
	let usdtUnits = 0;
	for (const row of channels) {
		if (typeof row !== 'object' || row === null) continue;
		const channel = row as {
			assetId?: unknown;
			outboundBalanceMsat?: unknown;
			localBalanceMsat?: unknown;
			assetLocalAmount?: unknown;
		};
		const assetId = typeof channel.assetId === 'string' ? channel.assetId : '';
		if (assetId === usdtAssetId) {
			const units = numberValue(channel.assetLocalAmount);
			if (units > 0) usdtUnits += units;
			continue;
		}
		const msat = numberValue(channel.outboundBalanceMsat ?? channel.localBalanceMsat);
		if (msat > 0) btcMsat += msat;
	}
	return { btcSats: Math.floor(btcMsat / 1000), usdtUnits };
}

function numberValue(value: unknown): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'bigint') return Number(value);
	return 0;
}

/**
 * Mainnet Lightning stays off. UTEXO has not published a mainnet LSP or gateway.
 * Both the flag and the two URLs must be set before this returns anything.
 */
export function mainnetLightningConfig(
	env: {
		enabled?: string;
		lspBaseUrl?: string;
		gatewayUrl?: string;
	} = {
		enabled: import.meta.env.VITE_RGB_MAINNET_LIGHTNING as string | undefined,
		lspBaseUrl: import.meta.env.VITE_RGB_MAINNET_LSP_URL as string | undefined,
		gatewayUrl: import.meta.env.VITE_RGB_MAINNET_GATEWAY_URL as string | undefined
	}
): { lspBaseUrl: string; proxyUrl: string } | null {
	if (env.enabled !== 'true') return null;
	const lspBaseUrl = env.lspBaseUrl?.trim() ?? '';
	const proxyUrl = env.gatewayUrl?.trim() ?? '';
	if (!lspBaseUrl || !proxyUrl) return null;
	return { lspBaseUrl, proxyUrl };
}

export interface ManualChannelPlan {
	peerPubkey: string;
	peerUri?: string;
	capacitySat: number;
	assetId?: string;
	assetLocalAmount?: number;
	explicitBot: boolean;
}

/** Validate one manual channel. The Telegram bot pubkey is allowed only because the user typed it. */
export function planManualChannel(input: {
	peer: string;
	capacitySat: number;
	assetId?: string;
	assetAmount?: number;
}): { ok: true; plan: ManualChannelPlan } | { ok: false; error: string } {
	const raw = input.peer.trim();
	const at = raw.indexOf('@');
	const pubkey = (at === -1 ? raw : raw.slice(0, at)).trim();
	if (!/^[0-9a-fA-F]{66}$/.test(pubkey)) {
		return { ok: false, error: 'Enter the node public key (66 hex characters).' };
	}
	let peerUri: string | undefined;
	if (at !== -1) {
		const hostport = raw.slice(at + 1).trim();
		const colon = hostport.lastIndexOf(':');
		if (colon <= 0) return { ok: false, error: 'Enter the node as publickey@host:port.' };
		const host = hostport.slice(0, colon).trim();
		const port = Number(hostport.slice(colon + 1));
		if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
			return { ok: false, error: 'Enter a host and port, such as publickey@host:9735.' };
		}
		peerUri = `${pubkey}@${host}:${port}`;
	}
	if (!Number.isSafeInteger(input.capacitySat) || input.capacitySat < MIN_MANUAL_CHANNEL_SATS) {
		return {
			ok: false,
			error: `Bitcoin capacity must be at least ${MIN_MANUAL_CHANNEL_SATS.toLocaleString()} sats.`
		};
	}
	const assetId = input.assetId?.trim() ?? '';
	if (assetId && !assetId.startsWith('rgb:')) {
		return { ok: false, error: 'RGB asset id must start with rgb:.' };
	}
	if (assetId) {
		if (!Number.isSafeInteger(input.assetAmount) || (input.assetAmount ?? 0) < 1) {
			return { ok: false, error: 'RGB amount must be a whole number of base units, at least 1.' };
		}
	} else if (input.assetAmount != null && input.assetAmount !== 0) {
		return { ok: false, error: 'Add an RGB asset id or leave the asset amount empty.' };
	}
	return {
		ok: true,
		plan: {
			peerPubkey: pubkey,
			...(peerUri ? { peerUri } : {}),
			capacitySat: input.capacitySat,
			...(assetId ? { assetId, assetLocalAmount: input.assetAmount } : {}),
			explicitBot: pubkey.toLowerCase() === BOT_LSP_PUBKEY.toLowerCase()
		}
	};
}

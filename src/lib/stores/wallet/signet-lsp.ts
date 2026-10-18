import { writable } from 'svelte/store';
import {
	gatewaySocketsCapped,
	installGatewayGuard,
	resetGatewayGuardForTests
} from './gateway-guard';
import type { LightningFailure } from './lightning-status';
import { isWasmPanic, wasmBusy, withWasm, wasmCrashed } from './wasm-lock';

/** Funded RGB wallet. LSP discovery must not run on this fingerprint. */
export const FROZEN_RGB_FINGERPRINT = '1e192df5';

/** Old localhost on-chain receiver. Never use this fingerprint as the LSP payer. */
export const BLOCKED_LSP_PAYER = '4bfb7ab5';

/** Telegram bot node. Never pass this to connectPeer. */
export const BOT_LSP_PUBKEY = '023bafd0d9d2a72958ff8332b9a36972152b410c91e332da1716d3f7ea0831b650';

export const SIGNET_LSP_URL = 'https://lsp-signet.utexo.com';
/** Telegram faucet IFA. Signet LSP get_info does not list this id. */
export const FAUCET_IFA_ASSET = 'rgb:f~9F4X0C-TiLOTvy-pALF29V-2xJ2p0m-hP3_vpW-Alj4G5Y';
/**
 * LNUSDT from `GET /get_info` `supported_assets`.
 * The SDK `getInfo()` drops that list, and UtexoLsp has no `listPayableAssets`.
 */
export const SIGNET_USDT_ASSET = 'rgb:vDU5IB7L-ZJFyqM3-5KrG84e-L0Q4kzi-eg3y0nH-JzoBylw';
/** Sandbox channel wait. The LSP cron opens the channel; this only polls. */
export const SIGNET_CHANNEL_WAIT_MS = 30 * 60 * 1000;
/**
 * Shared by waitForChannel and awaitReceiveSettlement.
 * The SDK default is 2s, which overlaps syncWallet. The hosted LSP opens
 * channels about every 30s, so 15s is enough and keeps one poller off the wasm lock.
 */
export const SIGNET_CHANNEL_POLL_MS = 15_000;
/** Sandbox MERCHANT_KEEPALIVE_MS. The LSP only auto-opens for a connected peer. */
export const SIGNET_KEEPALIVE_MS = 15_000;
/** Stop reconnecting after this many failed handshakes. The gap doubles each time. */
export const SIGNET_KEEPALIVE_CAP = 4;
const SIGNET_KEEPALIVE_MAX_MS = 120_000;
/** LSP `min_payment_size_msat` is 3_000_000. This is that minimum in sats. */
export const SIGNET_INBOUND_SATS = 3_000;
export const SIGNET_INBOUND_RGB = 1111;
const LN_EXPIRY_SEC = 3600;
const MIN_PAY_MSAT = 3_000_000;
const BOT_LSP_HOST = '49.12.99.77';

export interface SignetLspFields {
	transportEndpoint: string;
	indexerUrl: string;
	proxyUrl: string;
	lspBaseUrl?: string;
	enableVirtualChannels: boolean;
}

export interface LspPeerInfo {
	peerPubkey: string;
	peerHost: string;
	peerPort: number;
}

interface NodeStop {
	reconnectManagerStopValue?: () => unknown;
	closeAllPeers?: () => Promise<void> | void;
	disconnectPeer?: (pubkey: string) => Promise<void> | void;
}

interface LspWallet {
	getLspConfig?: () => { baseUrl: string | null; bearerToken: string | null };
	createLsp?: () => Promise<unknown>;
	getLightningNode?: () => unknown;
	disconnectPeer?: (pubkey: string) => Promise<void> | void;
	_manager?: {
		rlnBinding?: {
			walletData?: { master_fingerprint?: unknown };
			nodeHandle?: NodeStop;
		};
	};
}

/**
 * Signet defaults. `nodeRuntimeId` is omitted: beta.12 init uses
 * `keys.master_fingerprint` when the field is absent.
 * The frozen fingerprint keeps virtual channels off and has no LSP URL.
 */
export function signetLspParams(fingerprint: string | null): SignetLspFields {
	const shared = {
		transportEndpoint: 'https://rgb-proxy.utexo.com/json-rpc',
		indexerUrl: 'https://esplora-api.utexo.com',
		proxyUrl: 'wss://ln-gateway-signet.utexo.com'
	};
	if (fingerprint === FROZEN_RGB_FINGERPRINT) {
		return { ...shared, enableVirtualChannels: false };
	}
	return { ...shared, enableVirtualChannels: true, lspBaseUrl: SIGNET_LSP_URL };
}

function walletFingerprint(wallet: LspWallet): string | null {
	const fingerprint = wallet._manager?.rlnBinding?.walletData?.master_fingerprint;
	return typeof fingerprint === 'string' && fingerprint.length > 0 ? fingerprint : null;
}

function lspPeer(value: unknown): LspPeerInfo | null {
	if (typeof value !== 'object' || value === null || !('peer' in value)) return null;
	const peer = (value as { peer?: unknown }).peer;
	if (typeof peer !== 'object' || peer === null) return null;
	const row = peer as { peerPubkey?: unknown; peerHost?: unknown; peerPort?: unknown };
	if (typeof row.peerPubkey !== 'string' || typeof row.peerHost !== 'string') return null;
	if (typeof row.peerPort !== 'number') return null;
	return { peerPubkey: row.peerPubkey, peerHost: row.peerHost, peerPort: row.peerPort };
}

function refusedBotPeer(peer: LspPeerInfo): boolean {
	return peer.peerPubkey === BOT_LSP_PUBKEY || peer.peerHost === BOT_LSP_HOST;
}

/** Asset ids `GET /get_info` will channel. The faucet IFA is never one of them. */
export function payableAssetIds(body: unknown): string[] {
	if (typeof body !== 'object' || body === null) return [];
	const assets = (body as { supported_assets?: unknown }).supported_assets;
	if (!Array.isArray(assets)) return [];
	const ids: string[] = [];
	for (const row of assets) {
		if (typeof row !== 'object' || row === null) continue;
		const id = (row as { asset_id?: unknown }).asset_id;
		if (typeof id !== 'string' || !id.startsWith('rgb:')) continue;
		if (id === FAUCET_IFA_ASSET) continue;
		ids.push(id);
	}
	return ids;
}

interface LightningPay {
	rgbInvoice: string;
	ln?: { amtMsat?: number; expirySec?: number; assetId?: string; assetAmount?: number };
}

interface InboundReceive {
	assetId: string;
	amountSats: number;
	amountRgb: number;
}

interface InboundResult {
	lnInvoice: string;
	rgbInvoice: string;
	mappingId?: string;
}

interface ChannelWait {
	(
		assetId: string,
		opts?: {
			timeoutMs?: number;
			pollIntervalMs?: number;
			signal?: AbortSignal;
			onProgress?: (message: string) => void;
		}
	): Promise<unknown>;
}

interface ActiveLightning {
	peer: LspPeerInfo;
	channelReady: boolean;
	assetId: string;
	lnInvoice: string;
	rgbInvoice: string;
	connect?: () => Promise<void>;
	listPeers?: () => Promise<unknown>;
	waitForChannel?: ChannelWait;
	receiveAsset?: (opts: InboundReceive) => Promise<InboundResult>;
	awaitReceiveSettlement?: (
		lnInvoice: string,
		opts?: { timeoutMs?: number; pollIntervalMs?: number }
	) => Promise<unknown>;
	sendAsset: (opts: LightningPay) => Promise<unknown>;
}

export const lightningStore = writable({
	ready: false,
	peerHost: '',
	channel: 'idle' as 'idle' | 'waiting' | 'open' | 'missing',
	lnInvoice: '',
	rgbInvoice: '',
	failure: '' as LightningFailure
});

export function lspChannelOpen(): boolean {
	return activeLightning?.channelReady === true;
}

let activeLightning: ActiveLightning | null = null;

export function clearLightningWallet(): void {
	activeLightning = null;
	lightningStore.set({
		ready: false,
		peerHost: '',
		channel: 'idle',
		lnInvoice: '',
		rgbInvoice: '',
		failure: ''
	});
}

function bound<T>(fn: unknown, owner: object): T | undefined {
	if (typeof fn !== 'function') return undefined;
	return (fn as (...args: never[]) => unknown).bind(owner) as T;
}

/** Keep LSP methods on the SDK instance so `this` is not lost. */
export function bindLspClient(lsp: object): {
	client: object;
	connect?: () => Promise<void>;
	waitForChannel?: ChannelWait;
	receiveAsset?: ActiveLightning['receiveAsset'];
	awaitReceiveSettlement?: ActiveLightning['awaitReceiveSettlement'];
	sendAsset?: ActiveLightning['sendAsset'];
} {
	const row = lsp as Record<string, unknown>;
	return {
		client: lsp,
		connect: bound<() => Promise<void>>(row.connect, lsp),
		waitForChannel: bound<ChannelWait>(row.waitForChannel, lsp),
		receiveAsset: bound<NonNullable<ActiveLightning['receiveAsset']>>(row.receiveAsset, lsp),
		awaitReceiveSettlement: bound<NonNullable<ActiveLightning['awaitReceiveSettlement']>>(
			row.awaitReceiveSettlement,
			lsp
		),
		sendAsset: bound<ActiveLightning['sendAsset']>(row.sendAsset, lsp)
	};
}

function rememberLightning(lsp: unknown, peer: LspPeerInfo): void {
	if (typeof lsp !== 'object' || lsp === null) {
		clearLightningWallet();
		return;
	}
	const boundClient = bindLspClient(lsp);
	if (!boundClient.sendAsset) {
		clearLightningWallet();
		return;
	}
	const wallet = (lsp as { wallet?: { listPeers?: unknown } }).wallet;
	const listPeers = bound<() => Promise<unknown>>(wallet?.listPeers, wallet ?? lsp);
	activeLightning = {
		peer,
		channelReady: false,
		assetId: '',
		lnInvoice: '',
		rgbInvoice: '',
		sendAsset: boundClient.sendAsset,
		...(listPeers ? { listPeers } : {}),
		...(boundClient.connect ? { connect: boundClient.connect } : {}),
		...(boundClient.waitForChannel ? { waitForChannel: boundClient.waitForChannel } : {}),
		...(boundClient.receiveAsset ? { receiveAsset: boundClient.receiveAsset } : {}),
		...(boundClient.awaitReceiveSettlement
			? { awaitReceiveSettlement: boundClient.awaitReceiveSettlement }
			: {})
	};
	lightningStore.set({
		ready: false,
		peerHost: peer.peerHost,
		channel: 'idle',
		lnInvoice: '',
		rgbInvoice: '',
		failure: ''
	});
}

/**
 * Pay a task or service escrow invoice through the Signet LSP.
 * The LSP returns a Lightning invoice, this wallet pays it, and the LSP
 * sends the RGB asset. Does not call onchainSend.
 */
export async function payEscrowLightning(
	invoice: string,
	assetId: string,
	amount: number
): Promise<string> {
	const lsp = activeLightning;
	if (!lsp) throw new Error('Lightning wallet is not ready');
	if (refusedBotPeer(lsp.peer)) throw new Error('Lightning peer is refused');
	if (!lsp.channelReady) throw new Error('LSP channel is not open');
	const rgbInvoice = invoice.trim();
	if (!rgbInvoice.startsWith('rgb:') && !rgbInvoice.startsWith('rgb1')) {
		throw new Error('Funding destination must be an rgb: invoice for RGB-native escrow.');
	}
	if (lsp.connect) await lsp.connect();
	console.info('[wallet-lsp] payEscrowLightning', {
		assetId,
		amount,
		peerHost: lsp.peer.peerHost
	});
	const paid = await withWasm('lsp-send', () =>
		lsp.sendAsset({
			rgbInvoice,
			ln: { amtMsat: MIN_PAY_MSAT, expirySec: LN_EXPIRY_SEC, assetId, assetAmount: amount }
		})
	);
	return paymentId(paid);
}

function paymentId(paid: unknown): string {
	if (typeof paid !== 'object' || paid === null) return '';
	const row = paid as { mappingId?: unknown; sendResult?: { txid?: unknown } };
	if (typeof row.sendResult?.txid === 'string' && row.sendResult.txid) return row.sendResult.txid;
	if (typeof row.mappingId === 'string') return row.mappingId;
	return '';
}

/** True when listPeers already shows this LSP. Missing listPeers means "unknown". */
export function peerListedConnected(peers: unknown, pubkey: string): boolean {
	if (!Array.isArray(peers) || !pubkey) return false;
	return peers.some((row) => {
		if (typeof row !== 'object' || row === null) return false;
		const peer = row as { pubkey?: unknown; isConnected?: unknown };
		if (typeof peer.pubkey !== 'string' || peer.pubkey.toLowerCase() !== pubkey.toLowerCase()) {
			return false;
		}
		return peer.isConnected !== false;
	});
}

async function peerAlreadyConnected(): Promise<boolean> {
	const lsp = activeLightning;
	const listPeers = lsp?.listPeers;
	const pubkey = lsp?.peer.peerPubkey ?? '';
	if (typeof listPeers !== 'function' || !pubkey) return false;
	try {
		return peerListedConnected(await listPeers(), pubkey);
	} catch (error: unknown) {
		if (isWasmPanic(error)) throw error;
		console.warn(
			'[wallet-lsp] listPeers failed',
			error instanceof Error ? error.message : String(error)
		);
		return false;
	}
}

async function connectStoredLsp(): Promise<boolean> {
	const lsp = activeLightning;
	if (!lightningAttachConfirmed || lspHalted || wasmCrashed()) return false;
	if (!lsp?.connect || refusedBotPeer(lsp.peer)) return false;
	if (connectPeerUsed || connectInFlight || gatewaySocketsCapped()) return false;
	connectPeerUsed = true;
	connectInFlight = true;
	installLightningGuard();
	try {
		await lsp.connect();
		console.info('[wallet-lsp] connected', { peerHost: lsp.peer.peerHost });
		return true;
	} catch (error: unknown) {
		console.warn(
			'[wallet-lsp] connect failed',
			error instanceof Error ? error.message : String(error)
		);
		return false;
	} finally {
		connectInFlight = false;
	}
}

async function readLspAssets(): Promise<string[]> {
	const response = await fetch(`${SIGNET_LSP_URL}/get_info`);
	if (!response.ok) return [];
	const ids = payableAssetIds(await response.json());
	console.info('[wallet-lsp] payable assets', { assetIds: ids });
	return ids;
}

async function ensureLspAsset(): Promise<string | null> {
	const lsp = activeLightning;
	if (!lsp || refusedBotPeer(lsp.peer)) return null;
	const ids = await readLspAssets();
	if (!ids.includes(SIGNET_USDT_ASSET)) {
		console.warn('[wallet-lsp] signet USDT not in supported_assets', { assetIds: ids });
		return null;
	}
	lsp.assetId = SIGNET_USDT_ASSET;
	return SIGNET_USDT_ASSET;
}

/** Remember invoices already returned by receiveAsset. Does not mint another. */
export function keepLspInbound(lnInvoice: string, rgbInvoice: string): void {
	const lsp = activeLightning;
	if (!lsp || refusedBotPeer(lsp.peer)) return;
	if (!lnInvoice.startsWith('ln') || !rgbInvoice.startsWith('rgb:')) return;
	if (lsp.rgbInvoice) return;
	lsp.lnInvoice = lnInvoice;
	lsp.rgbInvoice = rgbInvoice;
	if (!lsp.assetId) lsp.assetId = SIGNET_USDT_ASSET;
	lightningStore.update((row) => ({ ...row, lnInvoice, rgbInvoice }));
	watchLspSettlement(lnInvoice).catch((error: unknown) => {
		console.warn(
			'[wallet-lsp] settlement failed',
			error instanceof Error ? error.message : String(error)
		);
	});
}

/** Ask the LSP for an inbound. Does not pay the rgbInvoice and does not send. */
export async function requestLspInbound(): Promise<string> {
	const lsp = activeLightning;
	if (!lsp?.receiveAsset || refusedBotPeer(lsp.peer)) return '';
	if (lsp.rgbInvoice) return lsp.lnInvoice;
	const assetId = await ensureLspAsset();
	if (!assetId) return '';
	try {
		const received = await lsp.receiveAsset({
			assetId,
			amountSats: SIGNET_INBOUND_SATS,
			amountRgb: SIGNET_INBOUND_RGB
		});
		lsp.lnInvoice = received.lnInvoice;
		lsp.rgbInvoice = received.rgbInvoice;
		lightningStore.update((row) => ({
			...row,
			lnInvoice: received.lnInvoice,
			rgbInvoice: received.rgbInvoice
		}));
		console.info('[wallet-lsp] receiveAsset', {
			assetId,
			mappingId: received.mappingId ?? ''
		});
		watchLspSettlement(received.lnInvoice).catch((error: unknown) => {
			console.warn(
				'[wallet-lsp] settlement failed',
				error instanceof Error ? error.message : String(error)
			);
		});
		return received.lnInvoice;
	} catch (error: unknown) {
		console.warn(
			'[wallet-lsp] receiveAsset failed',
			error instanceof Error ? error.message : String(error)
		);
		return '';
	}
}

let lspHalted = false;
let pollChain: Promise<void> = Promise.resolve();
let channelWait: Promise<void> | null = null;
let channelAbort: AbortController | null = null;
let keepaliveTimer: ReturnType<typeof setTimeout> | null = null;
let connectInFlight = false;
let connectPeerUsed = false;
let lightningAttachConfirmed = false;
let peerWallet: LspWallet | null = null;
let keepaliveFailures = 0;
let keepaliveDelay = SIGNET_KEEPALIVE_MS;

/** Wallet init calls this only after attachLightningNode returns. */
export function confirmLightningAttached(): void {
	lightningAttachConfirmed = true;
}

/** Remember the wallet so a socket cap can disconnect the peer once wasm is idle. */
export function watchLightningPeer(wallet: LspWallet): void {
	peerWallet = wallet;
}

function schedulePeerRelease(): void {
	const wallet = peerWallet;
	const pubkey = activeLightning?.peer.peerPubkey ?? '';
	let tries = 0;
	const run = () => {
		if (!wallet || !pubkey || tries >= 20) return;
		tries += 1;
		if (wasmBusy()) {
			setTimeout(run, 50);
			return;
		}
		void releaseLightningPeer(wallet, pubkey);
	};
	setTimeout(run, 0);
}

async function releaseLightningPeer(wallet: LspWallet, pubkey: string): Promise<void> {
	const handle = wallet._manager?.rlnBinding?.nodeHandle;
	try {
		handle?.reconnectManagerStopValue?.();
	} catch (error: unknown) {
		console.warn(
			'[wallet-lsp] reconnect stop failed',
			error instanceof Error ? error.message : String(error)
		);
	}
	try {
		if (typeof wallet.disconnectPeer === 'function') await wallet.disconnectPeer(pubkey);
		else await handle?.disconnectPeer?.(pubkey);
	} catch (error: unknown) {
		console.warn(
			'[wallet-lsp] disconnectPeer failed',
			error instanceof Error ? error.message : String(error)
		);
	}
	try {
		await handle?.closeAllPeers?.();
	} catch (error: unknown) {
		console.warn(
			'[wallet-lsp] close peers failed',
			error instanceof Error ? error.message : String(error)
		);
	}
}

function onGatewayCap(): void {
	lightningStore.update((row) => ({ ...row, ready: false, failure: row.failure || 'connect' }));
	stopLspPolling();
	schedulePeerRelease();
}

/** Cap gateway sockets before any connectPeer. Logs for that storm collapse. */
export function installLightningGuard(): void {
	installGatewayGuard(onGatewayCap);
}

function stopKeepalive(): void {
	if (keepaliveTimer === null) return;
	clearTimeout(keepaliveTimer);
	keepaliveTimer = null;
}

function resetKeepaliveState(): void {
	connectInFlight = false;
	keepaliveFailures = 0;
	keepaliveDelay = SIGNET_KEEPALIVE_MS;
}

function scheduleKeepalive(): void {
	stopKeepalive();
	if (lspHalted || wasmCrashed()) return;
	keepaliveTimer = setTimeout(() => {
		keepaliveTimer = null;
		void runKeepalive();
	}, keepaliveDelay);
}

/** One connect at a time. Failures back off, then stop. A dropped node is not retried. */
function startKeepalive(): void {
	stopKeepalive();
	keepaliveFailures = 0;
	keepaliveDelay = SIGNET_KEEPALIVE_MS;
	scheduleKeepalive();
}

async function runKeepalive(): Promise<void> {
	if (lspHalted || wasmCrashed()) {
		stopKeepalive();
		return;
	}
	if (connectInFlight) {
		scheduleKeepalive();
		return;
	}
	if (connectPeerUsed) {
		const stillUp = await peerAlreadyConnected().catch(() => false);
		if (lspHalted || wasmCrashed()) return;
		if (stillUp && !gatewaySocketsCapped()) {
			keepaliveFailures = 0;
			keepaliveDelay = SIGNET_KEEPALIVE_MS;
			scheduleKeepalive();
			return;
		}
		lightningStore.update((row) => ({ ...row, ready: false, failure: row.failure || 'connect' }));
		stopLspPolling();
		return;
	}
	let ok = false;
	try {
		if (lspHalted || wasmCrashed()) return;
		ok = (await peerAlreadyConnected()) || (await connectStoredLsp());
	} catch (error: unknown) {
		console.warn(
			'[wallet-lsp] keepalive failed',
			error instanceof Error ? error.message : String(error)
		);
		ok = false;
	}
	if (lspHalted || wasmCrashed()) return;
	if (ok) {
		keepaliveFailures = 0;
		keepaliveDelay = SIGNET_KEEPALIVE_MS;
		scheduleKeepalive();
		return;
	}
	keepaliveFailures += 1;
	keepaliveDelay = Math.min(
		SIGNET_KEEPALIVE_MAX_MS,
		SIGNET_KEEPALIVE_MS * 2 ** (keepaliveFailures - 1)
	);
	console.warn('[wallet-lsp] keepalive backoff', {
		failures: keepaliveFailures,
		delayMs: keepaliveDelay
	});
	if (keepaliveFailures >= SIGNET_KEEPALIVE_CAP) {
		lightningStore.update((row) => ({ ...row, ready: false, failure: row.failure || 'connect' }));
		stopLspPolling();
		return;
	}
	scheduleKeepalive();
}

/** Stop LSP polling after a wasm panic. In-flight SDK calls are not reused. */
export function stopLspPolling(): void {
	lspHalted = true;
	channelAbort?.abort();
	channelAbort = null;
	channelWait = null;
	stopKeepalive();
}

/** Drops the poll chain between unit tests. */
export function resetSignetLspForTests(): void {
	stopKeepalive();
	resetKeepaliveState();
	channelAbort?.abort();
	channelAbort = null;
	lspHalted = false;
	connectPeerUsed = false;
	lightningAttachConfirmed = false;
	peerWallet = null;
	pollChain = Promise.resolve();
	channelWait = null;
	resetGatewayGuardForTests();
	clearLightningWallet();
}

function enqueuePoll(run: () => Promise<void>): Promise<void> {
	if (lspHalted) return Promise.resolve();
	const next = pollChain.then(run, run);
	pollChain = next.then(
		() => undefined,
		() => undefined
	);
	return next;
}

async function watchLspSettlement(lnInvoice: string): Promise<void> {
	await enqueuePoll(async () => {
		const lsp = activeLightning;
		if (lspHalted || !lsp?.awaitReceiveSettlement || refusedBotPeer(lsp.peer)) return;
		const outcome = await lsp.awaitReceiveSettlement(lnInvoice, {
			timeoutMs: SIGNET_CHANNEL_WAIT_MS,
			pollIntervalMs: SIGNET_CHANNEL_POLL_MS
		});
		if (outcome !== 'settled') {
			console.info('[wallet-lsp] inbound pending', { outcome: String(outcome) });
		}
	});
}

async function pollSignetChannel(): Promise<void> {
	const lsp = activeLightning;
	if (lspHalted || !lsp?.waitForChannel || refusedBotPeer(lsp.peer)) return;
	const assetId = await ensureLspAsset();
	if (!assetId || lspHalted) return;
	if (wasmCrashed()) return;
	lightningStore.update((row) => ({ ...row, channel: 'waiting', failure: '' }));
	channelAbort?.abort();
	channelAbort = new AbortController();
	const signal = channelAbort.signal;
	try {
		const info = await lsp.waitForChannel(assetId, {
			timeoutMs: SIGNET_CHANNEL_WAIT_MS,
			pollIntervalMs: SIGNET_CHANNEL_POLL_MS,
			signal,
			onProgress: (message) => console.info('[wallet-lsp] waitForChannel', message)
		});
		if (lspHalted) return;
		lsp.channelReady = true;
		lightningStore.update((row) => ({ ...row, ready: true, channel: 'open', failure: '' }));
		console.info('[wallet-lsp] channel', info);
	} catch (error: unknown) {
		if (lspHalted) return;
		lsp.channelReady = false;
		lightningStore.update((row) => ({
			...row,
			ready: false,
			channel: 'missing',
			failure: 'channel'
		}));
		console.warn('[wallet-lsp] no channel', error instanceof Error ? error.message : String(error));
	}
}

/** Poll until the Signet LSP has a usable USDT channel. Does not open or fund one. */
export function waitSignetChannel(): Promise<void> {
	if (lspHalted) return Promise.resolve();
	if (channelWait) return channelWait;
	channelWait = enqueuePoll(pollSignetChannel).finally(() => {
		channelWait = null;
	});
	return channelWait;
}

/**
 * GET /get_info via createLsp() with no peer. beta.12 createLsp calls
 * getNetwork(), which throws until init(), so this runs after unlock.
 * Then lsp.connect(). The LSP cron opens the channel; this client does not.
 * Does not call openChannel, failTransfers, or a client-funded channel open.
 */
export async function discoverSignetLsp(wallet: LspWallet): Promise<void> {
	const fingerprint = walletFingerprint(wallet);
	if (fingerprint === FROZEN_RGB_FINGERPRINT || fingerprint === BLOCKED_LSP_PAYER) {
		clearLightningWallet();
		console.info('[wallet-lsp] skipped wallet', { fingerprint });
		return;
	}
	if (typeof wallet.createLsp !== 'function') {
		clearLightningWallet();
		lightningStore.update((row) => ({ ...row, failure: 'attach' }));
		console.warn('[wallet-lsp] createLsp missing');
		return;
	}
	const config = wallet.getLspConfig?.();
	console.info('[wallet-lsp] getLspConfig', { baseUrl: config?.baseUrl ?? null });
	try {
		const lsp = await wallet.createLsp();
		const peer = lspPeer(lsp);
		if (!peer) {
			clearLightningWallet();
			lightningStore.update((row) => ({ ...row, failure: 'connect' }));
			console.info('[wallet-lsp] get_info', { peer: null });
			return;
		}
		if (refusedBotPeer(peer)) {
			clearLightningWallet();
			lightningStore.update((row) => ({ ...row, failure: 'connect' }));
			console.warn('[wallet-lsp] refused bot peer', {
				peerHost: peer.peerHost,
				peerPort: peer.peerPort
			});
			return;
		}
		watchLightningPeer(wallet);
		rememberLightning(lsp, peer);
		console.info('[wallet-lsp] get_info', peer);
		const connected = await connectStoredLsp();
		if (!connected || gatewaySocketsCapped()) {
			lightningStore.update((row) => (row.failure ? row : { ...row, failure: 'connect' }));
			return;
		}
		startKeepalive();
		void waitSignetChannel();
	} catch (error: unknown) {
		clearLightningWallet();
		lightningStore.update((row) => ({ ...row, failure: 'connect' }));
		console.warn(
			'[wallet-lsp] get_info failed',
			error instanceof Error ? error.message : String(error)
		);
	}
}

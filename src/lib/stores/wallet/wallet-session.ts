import { writable } from 'svelte/store';

/** Shown while a spent listing or an Esplora mismatch is being read again. */
export const REFRESHING_WALLET = 'Refreshing wallet…';

/** Same-browser lock and a chain view that moved without this session. */
export const OTHER_SESSION_WARNING =
	'This wallet is open in another tab or browser. Close it or refresh';

export const HEARTBEAT_MS = 2_000;
export const HEARTBEAT_STALE_MS = 6_000;

export interface SessionBeat {
	id: string;
	at: number;
}

export interface ChainView {
	id: string;
	signature: string;
	at: number;
}

export interface WalletSessionState {
	refreshing: boolean;
	holdsLock: boolean;
	blocked: boolean;
}

const idle: WalletSessionState = { refreshing: false, holdsLock: true, blocked: false };

export const walletSession = writable<WalletSessionState>(idle);

let sessionId = '';
let fingerprint = '';
let foreignChange = false;
let refreshDepth = 0;
let beatTimer: ReturnType<typeof setInterval> | null = null;
let channel: BroadcastChannel | null = null;
let localSend = false;
let localRefresh = false;

function storageKey(fp: string): string {
	return `bittasker.wallet-lock.${fp.toLowerCase()}`;
}

function viewKey(fp: string): string {
	return `bittasker.wallet-view.${fp.toLowerCase() || 'local'}`;
}

export function parseBeats(raw: string | null): SessionBeat[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((item) => {
			if (!item || typeof item !== 'object') return [];
			const row = item as { id?: unknown; at?: unknown };
			if (typeof row.id !== 'string' || row.id.length === 0) return [];
			if (typeof row.at !== 'number' || !Number.isFinite(row.at)) return [];
			return [{ id: row.id, at: row.at }];
		});
	} catch {
		return [];
	}
}

export function liveBeats(beats: SessionBeat[], now: number, staleMs = HEARTBEAT_STALE_MS): SessionBeat[] {
	const seen = new Set<string>();
	return beats.filter((beat) => {
		if (now - beat.at >= staleMs || seen.has(beat.id)) return false;
		seen.add(beat.id);
		return true;
	});
}

/** True when this session is the only heartbeat that is still fresh. */
export function soleLock(beats: SessionBeat[], selfId: string, now: number): boolean {
	const live = liveBeats(beats, now);
	return live.length === 1 && live[0]?.id === selfId;
}

export function withBeat(beats: SessionBeat[], selfId: string, now: number): SessionBeat[] {
	const others = liveBeats(beats, now).filter((beat) => beat.id !== selfId);
	return [...others, { id: selfId, at: now }];
}

export function withoutBeat(beats: SessionBeat[], selfId: string): SessionBeat[] {
	return beats.filter((beat) => beat.id !== selfId);
}

/**
 * Another tab wrote a different allocation list, or the chain moved and this
 * session did not send or refresh it.
 */
export function foreignView(
	previous: ChainView | null,
	nextSignature: string,
	selfId: string,
	ownChange: boolean
): boolean {
	if (!previous || previous.signature === nextSignature) return false;
	if (previous.id === selfId && ownChange) return false;
	return true;
}

export function allocationSignature(
	rows: readonly { txid: string; vout: number; amount: number }[]
): string {
	return rows
		.map((row) => `${row.txid.toLowerCase()}:${row.vout}:${row.amount}`)
		.sort()
		.join('|');
}

function publish(holdsLock = true): void {
	walletSession.set({
		refreshing: refreshDepth > 0,
		holdsLock,
		blocked: !holdsLock || foreignChange
	});
}

export function setWalletRefreshing(active: boolean): void {
	refreshDepth += active ? 1 : -1;
	if (refreshDepth < 0) refreshDepth = 0;
	let holdsLock = true;
	const stop = walletSession.subscribe((row) => {
		holdsLock = row.holdsLock;
	});
	stop();
	publish(holdsLock);
}

export function sessionBlocksSend(): boolean {
	let blocked = false;
	const stop = walletSession.subscribe((row) => {
		blocked = row.blocked;
	});
	stop();
	return blocked;
}

export function markLocalSend(): void {
	localSend = true;
}

export function markLocalRefresh(): void {
	localRefresh = true;
}

function browserStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function readStorage(key: string): string | null {
	try {
		return browserStorage()?.getItem(key) ?? null;
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string): void {
	const storage = browserStorage();
	if (!storage) return;
	try {
		storage.setItem(key, value);
	} catch (error: unknown) {
		console.warn(
			'[wallet-session] could not store the lock',
			error instanceof Error ? error.message : String(error)
		);
	}
}

function currentId(): string {
	if (!sessionId) sessionId = Math.random().toString(36).slice(2);
	return sessionId;
}

function readView(): ChainView | null {
	const raw = readStorage(viewKey(fingerprint || 'local'));
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		const row = parsed as { id?: unknown; signature?: unknown; at?: unknown };
		if (typeof row.id !== 'string' || typeof row.signature !== 'string') return null;
		if (typeof row.at !== 'number') return null;
		return { id: row.id, signature: row.signature, at: row.at };
	} catch {
		return null;
	}
}

/** Remember the allocation list. A change we did not make blocks sends. */
export function noteChainView(signature: string): void {
	if (!fingerprint) return;
	const id = currentId();
	const previous = readView();
	const own = localSend || localRefresh;
	if (foreignView(previous, signature, id, own)) foreignChange = true;
	localSend = false;
	localRefresh = false;
	writeStorage(viewKey(fingerprint || 'local'), JSON.stringify({ id, signature, at: Date.now() }));
	let holdsLock = true;
	const stop = walletSession.subscribe((row) => {
		holdsLock = row.holdsLock;
	});
	stop();
	publish(holdsLock);
}

function beatNow(): void {
	if (!fingerprint || !browserStorage()) {
		publish(true);
		return;
	}
	const now = Date.now();
	const next = withBeat(parseBeats(readStorage(storageKey(fingerprint))), currentId(), now);
	writeStorage(storageKey(fingerprint), JSON.stringify(next));
	publish(soleLock(next, currentId(), now));
	channel?.postMessage({ id: currentId(), at: now });
}

function releaseBeat(): void {
	if (!fingerprint || !browserStorage()) return;
	const next = withoutBeat(parseBeats(readStorage(storageKey(fingerprint))), currentId());
	writeStorage(storageKey(fingerprint), JSON.stringify(next));
	channel?.postMessage({ id: currentId(), type: 'release' });
}

function onForeignBeat(): void {
	beatNow();
}

/** One heartbeat lock for this browser, keyed by the wallet fingerprint. */
export function beginWalletSession(nextFingerprint: string): void {
	endWalletSession();
	fingerprint = nextFingerprint.trim().toLowerCase();
	currentId();
	if (!fingerprint || typeof window === 'undefined') {
		publish(true);
		return;
	}
	if (typeof BroadcastChannel !== 'undefined') {
		channel = new BroadcastChannel(`bittasker-wallet-${fingerprint}`);
		channel.onmessage = () => onForeignBeat();
	}
	window.addEventListener('storage', onForeignBeat);
	window.addEventListener('pagehide', releaseBeat);
	beatNow();
	beatTimer = setInterval(beatNow, HEARTBEAT_MS);
}

export function endWalletSession(): void {
	if (beatTimer) clearInterval(beatTimer);
	beatTimer = null;
	if (typeof window !== 'undefined') {
		window.removeEventListener('storage', onForeignBeat);
		window.removeEventListener('pagehide', releaseBeat);
	}
	releaseBeat();
	channel?.close();
	channel = null;
	fingerprint = '';
	foreignChange = false;
	publish(true);
}

/** The Refresh button. Sends stay blocked while another tab still holds the lock. */
export function acknowledgeWalletSession(): void {
	foreignChange = false;
	beatNow();
}

/** Test helper. Puts the module back to a single unlocked session. */
export function resetWalletSession(): void {
	endWalletSession();
	sessionId = '';
	localSend = false;
	localRefresh = false;
	refreshDepth = 0;
	walletSession.set(idle);
}

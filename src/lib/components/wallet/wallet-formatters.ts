/**
 * Wallet formatting utilities — pure functions with no side effects.
 * All dependencies are passed as parameters. No store imports.
 */
import { formatUsdtBalance } from '$lib/types/rgb-contract';

/**
 * Map native balance row keys to the cache keys used by legacy persisted
 * snapshots while wallets transition to the native asset identifiers.
 */
/** Bitcoin stays orange, Tether stays green, Lightning stays light gray. */
export function assetButtonTone(id: 'btc_onchain' | 'btc_lightning' | 'usdt_rgb'): string {
	if (id === 'btc_onchain') return 'btn-primary';
	if (id === 'usdt_rgb') return 'btn-success';
	return 'border-base-content/20 bg-base-content/20 text-base-content hover:bg-base-content/30';
}

const BALANCE_TO_CACHE_KEY: Record<string, string> = {
	usdt_rgb: 'usdt',
	btc_lightning: 'btc'
};

/**
 * Format raw satoshi value with equivalent USD value.
 * @param rawSats - Raw satoshi string or number (nullable)
 * @param satsFormatter - Intl.NumberFormat for sats display
 * @param usdFormatter - Intl.NumberFormat for USD display
 * @param btcPrice - Current BTC price in USD
 * @returns Formatted string like "1,234 Sats ($0.50)"
 */
export function formatSatsWithUsd(
	rawSats: string | number | undefined | null,
	satsFormatter: Intl.NumberFormat,
	usdFormatter: Intl.NumberFormat,
	btcPrice: number
): string {
	const sats = Number(rawSats ?? 0);
	if (sats <= 0) return '0 Sats';
	const satsStr = satsFormatter.format(sats);
	const btc = sats / 100_000_000;
	const usd = btc * btcPrice;
	const usdStr = usdFormatter.format(usd);
	return `${satsStr} Sats (${usdStr})`;
}

/**
 * Stable inner balance format — falls back to cached per-asset raw when live is zero.
 * Prevents balance flickering to zero during refresh gaps.
 * @param wallet - Wallet with balances
 * @param key - Native balance key (e.g. 'btc', 'btc_lightning', 'usdt_rgb')
 * @param lastKnownWalletBalances - Per-wallet last-known balances cache
 * @param satsFormatter - Intl.NumberFormat for sats display
 * @param usdFormatter - Intl.NumberFormat for USD display
 * @param btcPrice - Current BTC price in USD
 * @returns Formatted balance string
 */
export function stableInnerFormat(
	wallet: {
		id: string;
		balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined;
	},
	key: string,
	lastKnownWalletBalances: Record<
		string,
		{ btc: string; usdt: string; wbtc: string; tbtc: string }
	>,
	satsFormatter: Intl.NumberFormat,
	usdFormatter: Intl.NumberFormat,
	btcPrice: number
): string {
	const bal = wallet.balances?.[key];
	const raw = Number(bal?.raw ?? 0);
	if (raw > 0) {
		if (key === 'usdt_rgb') return `$${(raw / 1e6).toFixed(2)}`;
		return formatSatsWithUsd(raw, satsFormatter, usdFormatter, btcPrice);
	}
	const cached = lastKnownWalletBalances[wallet.id];
	if (cached) {
		const cacheKey = BALANCE_TO_CACHE_KEY[key] ?? key;
		const cachedRaw = Number((cached as Record<string, string>)[cacheKey] ?? 0);
		if (cachedRaw > 0) {
			if (key === 'usdt_rgb') return `$${(cachedRaw / 1e6).toFixed(2)}`;
			return formatSatsWithUsd(cachedRaw, satsFormatter, usdFormatter, btcPrice);
		}
	}
	if (key === 'usdt_rgb') return '$0.00';
	return '0 Sats';
}

/**
 * Stable display value for a wallet's accordion title (total USD).
 * Falls back to cached balances when live balances are zero.
 * @param wallet - Wallet with balances
 * @param lastKnownWalletBalances - Per-wallet last-known balances cache
 * @param usdFormatter - Intl.NumberFormat for USD display
 * @param btcPrice - Current BTC price in USD
 * @returns Formatted USD string
 */
export function stableWalletAvailableUsd(
	wallet: {
		id: string;
		balances: Record<string, { raw: string; formatted: string; loading: boolean }> | undefined;
	},
	lastKnownWalletBalances: Record<
		string,
		{ btc: string; usdt: string; wbtc: string; tbtc: string }
	>,
	usdFormatter: Intl.NumberFormat,
	btcPrice: number
): string {
	const cur = wallet.balances;
	if (cur) {
		const btcSats = Number(cur.btc?.raw ?? 0);
		const lightningSats = Number(cur.btc_lightning?.raw ?? 0);
		const usdtRaw = Number(cur.usdt_rgb?.raw ?? 0);
		if (btcSats > 0 || lightningSats > 0 || usdtRaw > 0) {
			return usdFormatter.format(
				((btcSats + lightningSats) / 100_000_000) * btcPrice + usdtRaw / 1e6
			);
		}
	}
	const cached = lastKnownWalletBalances[wallet.id];
	if (cached) {
		const usd = (Number(cached.btc) / 100_000_000) * btcPrice + Number(cached.usdt) / 1e6;
		if (usd > 0) return usdFormatter.format(usd);
	}
	return usdFormatter.format(0);
}

export function summarizeUtxoKinds(kinds: readonly string[]): {
	colored: number;
	locked: number;
	available: number;
} {
	const colored = kinds.filter((kind) => kind === 'colored').length;
	const locked = kinds.filter((kind) => kind === 'locked').length;
	return { colored, locked, available: kinds.length - colored - locked };
}

const SIGNET_TX_BASE = 'https://esplora-api.utexo.com/tx/';

/** UTEXO Signet transaction, same host as the confirmed Pay send. */
export function signetTxUrl(txid: string | undefined): string | null {
	const id = (txid ?? '').trim().toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(id)) return null;
	return `${SIGNET_TX_BASE}${id}`;
}

/** `txid:vout` with the txid cut to four characters on each side. */
export function shortOutpoint(outpoint: string): string {
	const splitAt = outpoint.lastIndexOf(':');
	const txid = splitAt === -1 ? outpoint : outpoint.slice(0, splitAt);
	const vout = splitAt === -1 ? '' : outpoint.slice(splitAt + 1);
	const short = txid.length <= 12 ? txid : `${txid.slice(0, 4)}…${txid.slice(-4)}`;
	return vout ? `${short}:${vout}` : short;
}

export function formatRelativeTime(timestamp: number, now: number, language: string): string {
	const locale = language || 'en';
	const deltaMs = timestamp - now;
	const absSec = Math.abs(deltaMs) / 1000;
	if (absSec >= 86_400 * 7) {
		return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(timestamp);
	}
	const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	if (absSec < 60) return rtf.format(Math.round(deltaMs / 1000), 'second');
	if (absSec < 3_600) return rtf.format(Math.round(deltaMs / 60_000), 'minute');
	if (absSec < 86_400) return rtf.format(Math.round(deltaMs / 3_600_000), 'hour');
	return rtf.format(Math.round(deltaMs / 86_400_000), 'day');
}

export function pickHeroAsset<T extends { symbol?: string; assetId: string }>(
	assets: readonly T[]
): { hero: T | null; rest: T[] } {
	const hero = assets.find((asset) => asset.symbol?.toUpperCase() === 'USDT') ?? assets[0] ?? null;
	if (!hero) return { hero: null, rest: [] };
	return { hero, rest: assets.filter((asset) => asset.assetId !== hero.assetId) };
}

export function isRgbMovement(description: string | undefined): boolean {
	return (description ?? '').toLowerCase().includes('rgb');
}

function assignmentAmount(value: unknown): number | null {
	if (!value || typeof value !== 'object') return null;
	const amount = (value as { amount?: unknown }).amount;
	const numeric =
		typeof amount === 'number' ? amount : typeof amount === 'string' ? Number(amount) : NaN;
	return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function assignmentTotal(value: unknown): number {
	if (!Array.isArray(value)) return 0;
	return value.reduce((sum, assignment) => sum + (assignmentAmount(assignment) ?? 0), 0);
}

function txidValue(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value.toLowerCase() : null;
}

export interface RgbHistoryMove {
	units: number;
	incoming: boolean;
}

/**
 * RGB units keyed by the bitcoin txid shown in history.
 * A blank receive stores the amount on assignments and the wallet tx on receiveUtxo.
 * A send stores the moved amount on requestedAssignment; the assignment is the change.
 */
export interface RgbHistoryRow {
	ids: string[];
	type: 'send' | 'receive';
	assetUnits: number;
	timestamp: number;
	status: 'pending' | 'confirmed';
}

const RGB_HISTORY_STATUS = new Set(['Settled', 'WaitingConfirmations', 'WaitingSafeHeight']);

function historyTimestamp(value: unknown): number {
	const numeric =
		typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	if (!Number.isFinite(numeric) || numeric <= 0) return Date.now();
	return numeric > 1e12 ? numeric : numeric * 1000;
}

/** Settled, confirming, and outgoing RGB transfers still waiting on the recipient. */
export function rgbHistoryRows(transfers: unknown): RgbHistoryRow[] {
	if (!Array.isArray(transfers)) return [];
	const rows: RgbHistoryRow[] = [];
	for (const item of transfers) {
		if (!item || typeof item !== 'object') continue;
		const row = item as Record<string, unknown>;
		const status = typeof row.status === 'string' ? row.status : '';
		const kind = typeof row.kind === 'string' ? row.kind.toLowerCase() : '';
		const incoming = kind.includes('receive');
		const waitingSend = status === 'WaitingCounterparty' && !incoming;
		if (!RGB_HISTORY_STATUS.has(status) && !waitingSend) continue;
		const requested = assignmentAmount(row.requestedAssignment) ?? 0;
		const assigned = assignmentTotal(row.assignments);
		const units = incoming ? assigned || requested : requested || assigned;
		if (units <= 0) continue;
		const receive = row.receiveUtxo;
		const ids = [
			txidValue(row.txid),
			receive && typeof receive === 'object'
				? txidValue((receive as { txid?: unknown }).txid)
				: null
		].filter((id): id is string => id != null);
		rows.push({
			ids,
			type: incoming ? 'receive' : 'send',
			assetUnits: units,
			timestamp: historyTimestamp(row.updatedAt ?? row.createdAt),
			status: status === 'Settled' ? 'confirmed' : 'pending'
		});
	}
	return rows;
}

export interface BitcoinHistoryRecord {
	txid: string;
	received: number;
	sent: number;
	confirmationTime?: { timestamp?: number } | null;
	transactionType: string;
}

export interface WalletHistoryRow {
	id: string;
	type: 'send' | 'receive';
	amountSats: number;
	assetUnits?: number;
	timestamp: number;
	status: 'pending' | 'confirmed';
	txHash?: string;
	description: string;
}

/**
 * Bitcoin rows come from the Bitcoin wallet. USDT rows come from RGB transfers.
 * A shared txid must not turn the Bitcoin row into the USDT row.
 */
export function walletHistoryRows(
	records: BitcoinHistoryRecord[],
	transfers: unknown
): WalletHistoryRow[] {
	const bitcoin: WalletHistoryRow[] = records.map((record) => {
		const incoming = record.received > 0 && record.sent === 0;
		const timestamp = record.confirmationTime?.timestamp
			? record.confirmationTime.timestamp * 1000
			: Date.now();
		return {
			id: record.txid,
			type: incoming ? 'receive' : 'send',
			amountSats: Math.max(record.received, record.sent),
			timestamp,
			status: record.confirmationTime ? 'confirmed' : 'pending',
			txHash: record.txid,
			description: 'Bitcoin transfer'
		};
	});
	const usdt: WalletHistoryRow[] = rgbHistoryRows(transfers).map((row) => {
		const txHash = row.ids[0];
		return {
			id: `usdt:${txHash ?? row.timestamp}:${row.type}`,
			type: row.type,
			amountSats: 0,
			assetUnits: row.assetUnits,
			timestamp: row.timestamp,
			status: row.status,
			txHash,
			description: 'RGB transfer'
		};
	});
	return [...bitcoin, ...usdt].sort((left, right) => right.timestamp - left.timestamp);
}

export function transferMovements(transfers: unknown): Map<string, RgbHistoryMove> {
	const movements = new Map<string, RgbHistoryMove>();
	if (!Array.isArray(transfers)) return movements;
	for (const item of transfers) {
		if (!item || typeof item !== 'object') continue;
		const row = item as Record<string, unknown>;
		const kind = typeof row.kind === 'string' ? row.kind.toLowerCase() : '';
		const incoming = kind.includes('receive');
		const requested = assignmentAmount(row.requestedAssignment) ?? 0;
		const assigned = assignmentTotal(row.assignments);
		const units = incoming ? assigned || requested : requested || assigned;
		if (units <= 0) continue;
		const movement = { units, incoming };
		const receive = row.receiveUtxo;
		const keys = [
			txidValue(row.txid),
			receive && typeof receive === 'object'
				? txidValue((receive as { txid?: unknown }).txid)
				: null
		];
		for (const key of keys) {
			if (key) movements.set(key, movement);
		}
	}
	return movements;
}

/** USDT rows use asset units. Every row has an amount. Bitcoin rows use sats. */
export function formatHistoryAmount(
	description: string | undefined,
	amountSats: number,
	assetUnits: number | undefined,
	satsLabel: string
): string {
	if (isRgbMovement(description)) {
		const units = typeof assetUnits === 'number' && Number.isFinite(assetUnits) ? assetUnits : 0;
		if (units > 0) return formatUsdtBalance(units, 6);
	}
	const sats = Number.isFinite(amountSats) ? Math.max(0, Math.trunc(amountSats)) : 0;
	return `${new Intl.NumberFormat().format(sats)} ${satsLabel}`;
}

export function isBrandPicture(url: string): boolean {
	const value = url.toLowerCase();
	return (
		value.includes('bittasker-logo') ||
		value.includes('logomark') ||
		value.includes('/images/logos/')
	);
}

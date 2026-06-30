/**
 * Wallet formatting utilities — pure functions with no side effects.
 * All dependencies are passed as parameters. No store or module imports.
 */

/**
 * Map from balance row keys (used in wallet.balances) to cache keys
 * (used in lastKnownWalletBalances). The cache stores short names
 * ('usdt', 'tbtc') while balance keys use chain-suffixed names
 * ('usdt0-arb', 'tbtc-arb').
 */
const BALANCE_TO_CACHE_KEY: Record<string, string> = {
	'usdt0-arb': 'usdt',
	usdt: 'usdt',
	'tbtc-arb': 'tbtc'
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
 * @param key - Balance key (e.g. 'btc', 'rbtc', 'usdt0-arb', 'wbtc')
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
		{ rbtc: string; btc: string; usdt: string; wbtc: string; tbtc: string }
	>,
	satsFormatter: Intl.NumberFormat,
	usdFormatter: Intl.NumberFormat,
	btcPrice: number
): string {
	const bal = wallet.balances?.[key];
	const raw = Number(bal?.raw ?? 0);
	if (raw > 0) {
		if (key === 'usdt0-arb' || key === 'usdt') return `$${(raw / 1e6).toFixed(2)}`;
		if (key === 'tbtc-arb') {
			const sats = Math.round(raw / 10_000_000_000);
			return sats > 0 ? `${satsFormatter.format(sats)} Sats` : '0 Sats';
		}
		return formatSatsWithUsd(raw, satsFormatter, usdFormatter, btcPrice);
	}
	const cached = lastKnownWalletBalances[wallet.id];
	if (cached) {
		const cacheKey = BALANCE_TO_CACHE_KEY[key] ?? key;
		const cachedRaw = Number((cached as Record<string, string>)[cacheKey] ?? 0);
		if (cachedRaw > 0) {
			if (key === 'usdt0-arb' || key === 'usdt') return `$${(cachedRaw / 1e6).toFixed(2)}`;
			if (key === 'tbtc-arb') {
				const sats = Math.round(cachedRaw / 10_000_000_000);
				return sats > 0 ? `${satsFormatter.format(sats)} Sats` : '0 Sats';
			}
			return formatSatsWithUsd(cachedRaw, satsFormatter, usdFormatter, btcPrice);
		}
	}
	if (key === 'usdt0-arb' || key === 'usdt') return '$0.00';
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
		{ rbtc: string; btc: string; usdt: string; wbtc: string; tbtc: string }
	>,
	usdFormatter: Intl.NumberFormat,
	btcPrice: number
): string {
	const cur = wallet.balances;
	if (cur) {
		const btcSats =
			Number(cur.btc?.raw ?? 0) + Number(cur.rbtc?.raw ?? 0) + Number(cur.wbtc?.raw ?? 0);
		const tbtcSats = Math.round(Number(cur['tbtc-arb']?.raw ?? 0) / 10_000_000_000);
		const usdtRaw = Number(cur['usdt0-arb']?.raw ?? 0);
		if (btcSats > 0 || usdtRaw > 0 || tbtcSats > 0) {
			return usdFormatter.format(((btcSats + tbtcSats) / 100_000_000) * btcPrice + usdtRaw / 1e6);
		}
	}
	const cached = lastKnownWalletBalances[wallet.id];
	if (cached) {
		const tbtcSats = Math.round(Number(cached.tbtc ?? 0) / 10_000_000_000);
		const usd =
			((Number(cached.rbtc) + Number(cached.btc) + Number(cached.wbtc) + tbtcSats) / 100_000_000) *
				btcPrice +
			Number(cached.usdt) / 1e6;
		if (usd > 0) return usdFormatter.format(usd);
	}
	return usdFormatter.format(0);
}

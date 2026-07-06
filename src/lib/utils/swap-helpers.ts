/**
 * Pure helper functions extracted from SwapForm.svelte for reuse and testability.
 *
 * These functions have zero side-effects and no dependency on Svelte reactivity,
 * stores, or browser APIs. They can be safely imported from any module.
 */

// ---------------------------------------------------------------------------
// Asset detection
// ---------------------------------------------------------------------------

/**
 * Returns true if the asset or dest option id represents a bitcoin asset
 * (rBTC, WBTC, onchain BTC, tBTC, etc).
 *
 * Used to decide sats value formatting (sats + ≈ usd) for "you receive" / dest
 * lines in totals when one of source/dest is BTC.
 *
 * @param asset - Human-readable asset name (e.g. "rBTC", "Bitcoin (rBTC)")
 * @param id    - Dest option id (e.g. "rbtc-rsk", "wbtc-arb")
 */
export function isBitcoinAsset(asset?: string, id?: string): boolean {
	const a = (asset || '').toUpperCase().replace('BITCOIN', '').replace(/[()]/g, '').trim();
	const i = (id || '').toLowerCase();
	return (
		a === 'RBTC' ||
		a === 'WBTC' ||
		a === 'TBTC' ||
		a === 'BTC' ||
		i === 'rbtc-rsk' ||
		i === 'wbtc-arb' ||
		i === 'tbtc-arb' ||
		i === 'btc-onchain'
	);
}

// ---------------------------------------------------------------------------
// Provider label formatting
// ---------------------------------------------------------------------------

/**
 * Format a compound swap provider string for display.
 *
 * Splits on `+`, maps each part to a human-readable name, and re-joins with
 * ` + `.  Unrecognised providers get basic capitalisation.
 *
 * @example
 *   formatProviderLabel('boltz+lifi')  // 'Boltz + LI.FI'
 *   formatProviderLabel('symbiosis')   // 'Symbiosis'
 */
export function formatProviderLabel(provider: string): string {
	if (!provider) return '';
	return provider
		.split('+')
		.map((part) => {
			const trimmed = part.trim().toLowerCase();
			if (trimmed === 'lifi') return 'LI.FI';
			if (trimmed === 'boltz') return 'Boltz';
			if (trimmed === 'symbiosis') return 'Symbiosis';
			if (trimmed === 'changelly') return 'Changelly';
			return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
		})
		.join(' + ');
}

// ---------------------------------------------------------------------------
// Source ↔ Dest mapping constants
// ---------------------------------------------------------------------------

/** Maps source wallet type → equivalent dest type for same-asset detection.
 *  Used for self-send guards and direct-transfer detection.
 *  NOTE: 'tbtc-arb' deliberately excluded — tBTC→rBTC is a legitimate
 *  cross-chain Boltz swap (Arbitrum→RSK), not a self-send. */
export const SOURCE_TO_SAME_DEST: Record<string, string> = {
	rbtc: 'rbtc-rsk',
	'usdt0-arb': 'usdt0-arb',
	'wbtc-arb': 'wbtc-arb',
	'btc-onchain': 'btc-onchain'
};

/** Maps DestType → SourceWallet — used when flipping swap direction. */
export const DEST_TO_SOURCE: Record<string, string> = {
	'rbtc-rsk': 'rbtc',
	'usdt0-arb': 'usdt0-arb',
	'wbtc-arb': 'wbtc-arb',
	'btc-onchain': 'btc-onchain'
};

/** Maps SourceWallet → DestType — used when flipping swap direction. */
export const SOURCE_TO_DEST: Record<string, string> = {
	rbtc: 'rbtc-rsk',
	'wbtc-arb': 'wbtc-arb',
	'btc-onchain': 'btc-onchain',
	'usdt0-arb': 'usdt0-arb',
	'tbtc-arb': 'wbtc-arb'
};

// ---------------------------------------------------------------------------
// Shared SVG paths
// ---------------------------------------------------------------------------

/** Arrow-right icon used in swap route display (confirm, success phases). */
export const ARROW_SVG_PATH = 'M17 8l4 4m0 0l-4 4m4-4H3';

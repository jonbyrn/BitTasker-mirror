/**
 * Token Logo Service
 *
 * Resolves token logo URLs at runtime from the build-time manifest.
 * All logos are pre-downloaded from Symbiosis (CoinMarketCap CDN) — no
 * external API calls needed at runtime.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ManifestEntry {
	symbol: string;
	name: string;
	localPath: string;
	chainIds: number[];
}

// ---------------------------------------------------------------------------
// Manifest cache (fetched once from static assets)
// ---------------------------------------------------------------------------

let _manifest: ManifestEntry[] | null = null;
let _manifestLoaded = false;

async function loadManifest(): Promise<ManifestEntry[]> {
	if (_manifestLoaded) return _manifest ?? [];
	_manifestLoaded = true;
	try {
		const res = await fetch('/images/tokens/manifest.json');
		if (res.ok) _manifest = (await res.json()) as ManifestEntry[];
		else _manifest = [];
	} catch {
		_manifest = [];
	}
	return _manifest;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a token logo URL for the given symbol.
 *
 * @param symbol - Token symbol (e.g. "FTM", "SOL", "USDT")
 * @returns Local path to the pre-downloaded logo, or null if not found.
 */
export async function resolveTokenLogo(symbol: string): Promise<string | null> {
	const manifest = await loadManifest();
	const entry = manifest.find((m) => m.symbol.toUpperCase() === symbol.toUpperCase());
	return entry?.localPath ?? null;
}

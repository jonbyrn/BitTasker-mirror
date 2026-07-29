#!/usr/bin/env -S npx tsx
/**
 * Build-time script: discover swappable tokens via Symbiosis /v2/tokens,
 * filter to chains with verified routes to RSK/BSC, download token icons
 * from CoinMarketCap CDN, and generate the manifest.
 *
 * Symbiosis /v2/tokens returns every supported token with:
 *   { symbol, name, icon, chainId, address, decimals, priceUsd }
 * where `icon` is a CoinMarketCap CDN URL (no auth, no rate limits).
 *
 * Usage:  npx tsx scripts/fetch-token-logos.ts
 * Never exits non-zero — build must continue.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TOKENS_DIR = path.join(PROJECT_ROOT, 'static', 'images', 'tokens');
const MANIFEST_PATH = path.join(TOKENS_DIR, 'manifest.json');
const VERIFIED_PATH = path.join(TOKENS_DIR, 'verified-chains.json');
const FAILURE_CACHE_PATH = path.join(TOKENS_DIR, '.download-failures.json');

const SYMBIOSIS_BASE = 'https://api.symbiosis.finance/crosschain';
const LIFI_BASE = 'https://li.quest/v1';

const DEST_RSK = 30;
const DEST_BSC = 56;

/** LI.FI source chains to verify for RSK/BSC routing. */
const PRIORITY_CHAINS = [
	1, 56, 137, 42161, 10, 8453, 43114, 250, 100, 1284, 42220, 1313161554, 1399811149
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg: string) {
	console.log(`[token-logos] ${msg}`);
}
function warn(msg: string) {
	console.warn(`[token-logos] ⚠ ${msg}`);
}

async function fetchJSON<T>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json() as Promise<T>;
}

async function downloadFile(url: string, destPath: string): Promise<boolean> {
	try {
		const controller = new AbortController();
		const t = setTimeout(() => controller.abort(), 5_000);
		const res = await fetch(url, { signal: controller.signal });
		clearTimeout(t);
		if (!res.ok) return false;
		const ct = res.headers.get('content-type') ?? '';
		if (!ct.includes('image') && !ct.includes('octet-stream')) return false;
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length < 150) return false;
		fs.writeFileSync(destPath, buf);
		return true;
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Phase 1 — fetch Symbiosis tokens
// ---------------------------------------------------------------------------

interface SymbiosisToken {
	symbol: string;
	name: string;
	icon: string;
	chainId: number;
	address: string;
	decimals: number;
	priceUsd: number;
}

async function fetchSymbiosisTokens(): Promise<SymbiosisToken[]> {
	try {
		const tokens = await fetchJSON<SymbiosisToken[]>(`${SYMBIOSIS_BASE}/v2/tokens`);
		log(`Symbiosis tokens: ${tokens.length}`);
		return tokens;
	} catch (e) {
		warn(`Symbiosis tokens failed: ${e}`);
		return [];
	}
}

// ---------------------------------------------------------------------------
// Phase 2 — verify which chains can route to RSK / BSC via LI.FI
// ---------------------------------------------------------------------------

async function verifyChainRoutes(): Promise<Set<number>> {
	const verified = new Set<number>();

	for (const chainId of PRIORITY_CHAINS) {
		try {
			const [toRsk, toBsc] = await Promise.all([
				fetchJSON<{ connections: { fromTokens: unknown[] }[] }>(
					`${LIFI_BASE}/connections?fromChain=${chainId}&toChain=${DEST_RSK}`
				).catch(() => null),
				fetchJSON<{ connections: { fromTokens: unknown[] }[] }>(
					`${LIFI_BASE}/connections?fromChain=${chainId}&toChain=${DEST_BSC}`
				).catch(() => null)
			]);

			const hasRoute =
				(toRsk?.connections?.[0]?.fromTokens?.length ?? 0) > 0 ||
				(toBsc?.connections?.[0]?.fromTokens?.length ?? 0) > 0;

			if (hasRoute) verified.add(chainId);
		} catch {
			/* chain doesn't route — skip */
		}
	}

	// Also add chains from Symbiosis chain list (coarse verification)
	try {
		const symbChains = await fetchJSON<{ chainId?: number }[]>(`${SYMBIOSIS_BASE}/v1/chains`);
		for (const c of symbChains) {
			if (c.chainId && c.chainId > 0) verified.add(c.chainId);
		}
	} catch {
		/* skip */
	}

	log(`Verified chains: ${verified.size}`);
	return verified;
}

// ---------------------------------------------------------------------------
// Phase 3 — build unique token list from Symbiosis data
// ---------------------------------------------------------------------------

interface ManifestEntry {
	symbol: string;
	name: string;
	localPath: string;
	chainIds: number[];
}

function buildUniqueTokens(
	tokens: SymbiosisToken[],
	verifiedChains: Set<number>
): SymbiosisToken[] {
	// Filter to verified chains only — keep every (token, chain) pair
	const result = tokens
		.filter((t) => verifiedChains.has(t.chainId))
		.sort((a, b) => a.symbol.localeCompare(b.symbol));

	log(`Tokens on verified chains: ${result.length}`);
	return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	log('=== Token Logo Pipeline (Symbiosis + LI.FI) ===');
	fs.mkdirSync(TOKENS_DIR, { recursive: true });

	// Start fresh manifest each run (Symbiosis is canonical source)
	const manifest: ManifestEntry[] = [];

	// Phase 1: get all Symbiosis tokens
	log('Phase 1: Fetching Symbiosis tokens...');
	const symbTokens = await fetchSymbiosisTokens();
	if (symbTokens.length === 0) {
		warn('No Symbiosis tokens — aborting');
		return;
	}

	// Phase 2: verify chain routes
	log('Phase 2: Verifying chain routes...');
	const verifiedChains = await verifyChainRoutes();

	// Phase 3: build unique token list
	log('Phase 3: Building unique token list...');
	const uniqueTokens = buildUniqueTokens(symbTokens, verifiedChains);

	// Phase 4: download logo once per unique symbol, then create entry per chain
	log(`Phase 4: Processing ${uniqueTokens.length} token-chain pairs...`);

	// Collect unique symbols to download (one logo per symbol)
	const symbolsToDownload = new Map<string, SymbiosisToken>();
	for (const t of uniqueTokens) {
		if (!symbolsToDownload.has(t.symbol)) {
			symbolsToDownload.set(t.symbol, t);
		}
	}

	// Pre-filter: split into already-cached and needs-download
	let downloaded = 0;
	let skipped = 0;
	let failed = 0;
	const toDownload: Array<{ sym: string; t: SymbiosisToken }> = [];

	// Load failure cache — skip tokens that failed recently (retry after 7 days)
	let failureCache: Record<string, number> = {};
	try {
		if (fs.existsSync(FAILURE_CACHE_PATH)) {
			failureCache = JSON.parse(fs.readFileSync(FAILURE_CACHE_PATH, 'utf-8'));
		}
	} catch {
		/* ignore corrupt cache */
	}
	const FAILURE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
	const now = Date.now();
	let failureCacheSkipped = 0;

	for (const [sym, t] of symbolsToDownload) {
		if (!t.icon || t.icon.length < 10) {
			skipped++;
			continue;
		}
		const ext = t.icon.split('.').pop()?.split('?')[0] ?? 'png';
		const destPath = path.join(TOKENS_DIR, `${sym.toLowerCase()}.${ext}`);

		// Skip if the file already exists with a valid size (>150 bytes).
		if (fs.existsSync(destPath) && fs.statSync(destPath).size > 150) {
			skipped++;
			continue;
		}
		// Skip if recently failed (within TTL)
		const lastFail = failureCache[sym];
		if (lastFail && now - lastFail < FAILURE_TTL_MS) {
			failureCacheSkipped++;
			continue;
		}
		toDownload.push({ sym, t });
	}

	const totalSkipped = skipped + failureCacheSkipped;
	if (toDownload.length > 0) {
		log(`  ${totalSkipped} cached/skipped, ${toDownload.length} to download`);
	} else {
		log(`  All ${totalSkipped} logos cached/skipped — nothing to download`);
	}

	// Download in parallel batches of 20
	const BATCH_SIZE = 20;
	const newlyFailed: string[] = [];
	for (let i = 0; i < toDownload.length; i += BATCH_SIZE) {
		const batch = toDownload.slice(i, i + BATCH_SIZE);
		const results = await Promise.all(
			batch.map(async ({ sym, t }) => {
				const ext = t.icon.split('.').pop()?.split('?')[0] ?? 'png';
				const destPath = path.join(TOKENS_DIR, `${sym.toLowerCase()}.${ext}`);
				const ok = await downloadFile(t.icon, destPath);
				return { sym, ok, destPath };
			})
		);
		for (const r of results) {
			if (r.ok) {
				const size = fs.statSync(r.destPath).size;
				downloaded++;
				// Remove from failure cache on success
				delete failureCache[r.sym];
			} else {
				failed++;
				newlyFailed.push(r.sym);
			}
		}
		if (i + BATCH_SIZE < toDownload.length) {
			log(`  Progress: ${i + BATCH_SIZE}/${toDownload.length}...`);
		}
	}

	// Update failure cache with newly failed symbols
	if (newlyFailed.length > 0) {
		for (const sym of newlyFailed) {
			failureCache[sym] = now;
		}
		// Prune entries older than TTL
		for (const [sym, ts] of Object.entries(failureCache)) {
			if (now - ts > FAILURE_TTL_MS) delete failureCache[sym];
		}
		fs.writeFileSync(FAILURE_CACHE_PATH, JSON.stringify(failureCache, null, '\t') + '\n');
	}

	// Build manifest: one entry per (symbol, chain) pair
	for (const t of uniqueTokens) {
		if (!t.icon || t.icon.length < 10) continue;
		manifest.push({
			symbol: t.symbol,
			name: t.name || t.symbol,
			localPath: `/images/tokens/${t.symbol.toLowerCase()}.png`,
			chainIds: [t.chainId]
		});
	}

	// Phase 5: write verified chains
	fs.writeFileSync(VERIFIED_PATH, JSON.stringify([...verifiedChains].sort((a, b) => a - b)) + '\n');
	log(`Verified chains: ${VERIFIED_PATH} (${verifiedChains.size})`);

	// Phase 6: write manifest
	fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, '\t') + '\n');
	log(`Manifest: ${MANIFEST_PATH} (${manifest.length} entries)`);
	log(
		`Done — ${downloaded} new, ${skipped} skipped (cached), ${failed} failed, ${manifest.length} total`
	);
}

main()
	.catch((err) => {
		console.error('[token-logos] Unexpected error:', err);
	})
	.finally(() => {
		process.exit(0);
	});

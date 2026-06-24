/**
 * Slug Map — Maps canonical content keys to locale-specific URL paths.
 *
 * This is the single source of truth for:
 * - URL routing: resolveContentKey(locale, slug) → content key
 * - Prerendering: entries() iterates all values for all locales
 * - hreflang: getHreflangLinks(contentKey) → all locale variants
 * - Sitemap: all paths are derived from this map
 *
 * To add a new learn page:
 * 1. Add an entry here
 * 2. Create content files: src/lib/content/learn/{key}.en.ts + .es.ts
 * 3. That's it — route, prerendering, sitemap, hreflang all auto-resolve
 */

export interface SlugEntry {
	en: string;
	es: string;
}

export const SLUG_MAP: Record<string, SlugEntry> = {
	// ─── Pillar Pages ─────────────────────────────────────────────────
	wallet: { en: 'wallet', es: 'billetera' },
	security: { en: 'security', es: 'seguridad' },
	freelancing: { en: 'freelancing', es: 'freelance' },
	'bitcoin-freelancing': { en: 'bitcoin-freelancing', es: 'freelance-bitcoin' },
	bitcoin: { en: 'bitcoin', es: 'bitcoin' },
	rootstock: { en: 'rootstock', es: 'rootstock' },
	'bitcoin-layer-2': { en: 'bitcoin-layer-2', es: 'bitcoin-capa-2' },
	'future-of-work': { en: 'future-of-work', es: 'futuro-del-trabajo' },

	// ─── Wallets: Hardware Deep-Dives ─────────────────────────────────
	'wallet/coldcard': { en: 'wallet/coldcard', es: 'billetera/coldcard' },
	'wallet/foundation-passport': {
		en: 'wallet/foundation-passport',
		es: 'billetera/foundation-passport'
	},
	'wallet/bitbox': { en: 'wallet/bitbox', es: 'billetera/bitbox' },

	// ─── Wallets: Software Deep-Dives ─────────────────────────────────
	'wallet/aqua-wallet': { en: 'wallet/aqua-wallet', es: 'billetera/aqua-wallet' },
	'wallet/blink-wallet': { en: 'wallet/blink-wallet', es: 'billetera/blink-wallet' },

	// ─── Wallets: Comparisons ─────────────────────────────────────────
	'wallet/ledger-vs-trezor': { en: 'wallet/ledger-vs-trezor', es: 'billetera/ledger-vs-trezor' },
	'wallet/best-bitcoin-wallet': {
		en: 'wallet/best-bitcoin-wallet',
		es: 'billetera/mejor-billetera-bitcoin'
	},
	'wallet/hardware-vs-software': {
		en: 'wallet/hardware-vs-software',
		es: 'billetera/hardware-vs-software'
	},
	'wallet/lightning-wallet': { en: 'wallet/lightning-wallet', es: 'billetera/billetera-lightning' },
	'wallet/coldcard-vs-trezor': {
		en: 'wallet/coldcard-vs-trezor',
		es: 'billetera/coldcard-vs-trezor'
	},
	'wallet/coldcard-vs-ledger': {
		en: 'wallet/coldcard-vs-ledger',
		es: 'billetera/coldcard-vs-ledger'
	},
	'wallet/passport-vs-coldcard': {
		en: 'wallet/passport-vs-coldcard',
		es: 'billetera/passport-vs-coldcard'
	},
	'wallet/bitbox-vs-ledger': { en: 'wallet/bitbox-vs-ledger', es: 'billetera/bitbox-vs-ledger' },

	// ─── Wallets: Education ───────────────────────────────────────────
	'wallet/self-custody-guide': {
		en: 'wallet/self-custody-guide',
		es: 'billetera/guia-autocustodia'
	},
	'wallet/nostr-wallet-connect': {
		en: 'wallet/nostr-wallet-connect',
		es: 'billetera/nostr-wallet-connect'
	},
	'wallet/bittasker-wallet': { en: 'wallet/bittasker-wallet', es: 'billetera/billetera-bittasker' },

	// ─── Security & Trust ─────────────────────────────────────────────
	'security/is-bittasker-safe': {
		en: 'security/is-bittasker-safe',
		es: 'seguridad/bittasker-es-seguro'
	},
	'security/wallet-security': {
		en: 'security/wallet-security',
		es: 'seguridad/seguridad-billeteras'
	},
	'security/avoid-scams': { en: 'security/avoid-scams', es: 'seguridad/evitar-estafas' },
	'security/self-custody-vs-custodial': {
		en: 'security/self-custody-vs-custodial',
		es: 'seguridad/autocustodia-vs-custodio'
	},
	'security/hardware-security': {
		en: 'security/hardware-security',
		es: 'seguridad/seguridad-hardware'
	},

	// ─── Gig Economy Comparisons ──────────────────────────────────────
	'freelancing/upwork-alternatives': {
		en: 'freelancing/upwork-alternatives',
		es: 'freelance/alternativas-a-upwork'
	},
	'freelancing/fiverr-alternatives': {
		en: 'freelancing/fiverr-alternatives',
		es: 'freelance/alternativas-a-fiverr'
	},
	'freelancing/upwork-vs-fiverr': {
		en: 'freelancing/upwork-vs-fiverr',
		es: 'freelance/upwork-vs-fiverr'
	},
	'freelancing/best-freelance-platforms': {
		en: 'freelancing/best-freelance-platforms',
		es: 'freelance/mejores-plataformas-freelance'
	},
	'freelancing/thumbtack-alternatives': {
		en: 'freelancing/thumbtack-alternatives',
		es: 'freelance/alternativas-a-thumbtack'
	},
	'freelancing/freelancer-vs-upwork': {
		en: 'freelancing/freelancer-vs-upwork',
		es: 'freelance/freelancer-vs-upwork'
	},
	'freelancing/upwork-fees-explained': {
		en: 'freelancing/upwork-fees-explained',
		es: 'freelance/comisiones-upwork'
	},
	'freelancing/fiverr-fees-explained': {
		en: 'freelancing/fiverr-fees-explained',
		es: 'freelance/comisiones-fiverr'
	},
	'freelancing/bittasker-vs-upwork': {
		en: 'freelancing/bittasker-vs-upwork',
		es: 'freelance/bittasker-vs-upwork'
	},
	'freelancing/bittasker-vs-fiverr': {
		en: 'freelancing/bittasker-vs-fiverr',
		es: 'freelance/bittasker-vs-fiverr'
	},
	'freelancing/decentralized-freelancing': {
		en: 'freelancing/decentralized-freelancing',
		es: 'freelance/freelance-descentralizado'
	},

	// ─── Bitcoin Freelancing ──────────────────────────────────────────
	'bitcoin-freelancing/get-paid-in-bitcoin': {
		en: 'bitcoin-freelancing/get-paid-in-bitcoin',
		es: 'freelance-bitcoin/recibir-pago-en-bitcoin'
	},
	'bitcoin-freelancing/bitcoin-jobs': {
		en: 'bitcoin-freelancing/bitcoin-jobs',
		es: 'freelance-bitcoin/trabajos-bitcoin'
	},
	'bitcoin-freelancing/bitcoin-escrow': {
		en: 'bitcoin-freelancing/bitcoin-escrow',
		es: 'freelance-bitcoin/escrow-bitcoin'
	},
	'bitcoin-freelancing/crypto-payroll': {
		en: 'bitcoin-freelancing/crypto-payroll',
		es: 'freelance-bitcoin/nomina-cripto'
	},
	'bitcoin-freelancing/bitcoin-contractor-guide': {
		en: 'bitcoin-freelancing/bitcoin-contractor-guide',
		es: 'freelance-bitcoin/guia-contratista-bitcoin'
	},
	'bitcoin-freelancing/bittasker-bitcoin-payments': {
		en: 'bitcoin-freelancing/bittasker-bitcoin-payments',
		es: 'freelance-bitcoin/pagos-bitcoin-bittasker'
	},

	// ─── Bitcoin & Payments ───────────────────────────────────────────
	'bitcoin/lightning-network': { en: 'bitcoin/lightning-network', es: 'bitcoin/red-lightning' },
	'bitcoin/smart-contracts': {
		en: 'bitcoin/smart-contracts',
		es: 'bitcoin/contratos-inteligentes'
	},
	'bitcoin/nostr-identity': { en: 'bitcoin/nostr-identity', es: 'bitcoin/identidad-nostr' },
	'bitcoin/bitcoin-vs-ethereum': {
		en: 'bitcoin/bitcoin-vs-ethereum',
		es: 'bitcoin/bitcoin-vs-ethereum'
	},
	'bitcoin/stablecoins': { en: 'bitcoin/stablecoins', es: 'bitcoin/stablecoins' },
	'bitcoin/bittasker-payments': { en: 'bitcoin/bittasker-payments', es: 'bitcoin/pagos-bittasker' },

	// ─── Rootstock ────────────────────────────────────────────────────
	'rootstock/what-is-rootstock': {
		en: 'rootstock/what-is-rootstock',
		es: 'rootstock/que-es-rootstock'
	},
	'rootstock/rootstock-vs-stacks': {
		en: 'rootstock/rootstock-vs-stacks',
		es: 'rootstock/rootstock-vs-stacks'
	},
	'rootstock/bitcoin-smart-contracts': {
		en: 'rootstock/bitcoin-smart-contracts',
		es: 'rootstock/contratos-inteligentes-bitcoin'
	},
	'rootstock/bitcoin-defi': { en: 'rootstock/bitcoin-defi', es: 'rootstock/defi-bitcoin' },
	'rootstock/rootstock-vs-ethereum': {
		en: 'rootstock/rootstock-vs-ethereum',
		es: 'rootstock/rootstock-vs-ethereum'
	},
	'rootstock/bittasker-escrow-contracts': {
		en: 'rootstock/bittasker-escrow-contracts',
		es: 'rootstock/contratos-escrow-bittasker'
	},
	'rootstock/rbtc-guide': { en: 'rootstock/rbtc-guide', es: 'rootstock/guia-rbtc' },

	// ─── Bitcoin Layer 2s ─────────────────────────────────────────────
	'bitcoin-layer-2/rootstock': { en: 'bitcoin-layer-2/rootstock', es: 'bitcoin-capa-2/rootstock' },
	'bitcoin-layer-2/stacks': { en: 'bitcoin-layer-2/stacks', es: 'bitcoin-capa-2/stacks' },
	'bitcoin-layer-2/liquid-network': {
		en: 'bitcoin-layer-2/liquid-network',
		es: 'bitcoin-capa-2/red-liquid'
	},
	'bitcoin-layer-2/comparison-table': {
		en: 'bitcoin-layer-2/comparison-table',
		es: 'bitcoin-capa-2/tabla-comparativa'
	},
	'bitcoin-layer-2/bittasker-multi-chain': {
		en: 'bitcoin-layer-2/bittasker-multi-chain',
		es: 'bitcoin-capa-2/bittasker-multicadena'
	},

	// ─── Future of Work ───────────────────────────────────────────────
	'future-of-work/decentralized-labor': {
		en: 'future-of-work/decentralized-labor',
		es: 'futuro-del-trabajo/trabajo-descentralizado'
	},
	'future-of-work/gig-economy-2026': {
		en: 'future-of-work/gig-economy-2026',
		es: 'futuro-del-trabajo/economia-gig-2026'
	},
	'future-of-work/nostr-marketplace': {
		en: 'future-of-work/nostr-marketplace',
		es: 'futuro-del-trabajo/mercado-nostr'
	},
	'future-of-work/censorship-resistant-work': {
		en: 'future-of-work/censorship-resistant-work',
		es: 'futuro-del-trabajo/trabajo-resistente-censura'
	},
	'future-of-work/peer-to-peer-economy': {
		en: 'future-of-work/peer-to-peer-economy',
		es: 'futuro-del-trabajo/economia-par-a-par'
	}
};

// ─── Helper Functions ──────────────────────────────────────────────────

/** All supported locale codes */
export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Resolve a URL slug to its canonical content key for a given locale.
 * @returns content key (e.g. 'wallet/coldcard') or null if not found
 */
export function resolveContentKey(locale: string, slug: string): string | null {
	for (const [key, paths] of Object.entries(SLUG_MAP)) {
		if (paths[locale as SupportedLocale] === slug) return key;
	}
	return null;
}

/**
 * Get the URL path for a content key in a specific locale.
 * @returns path (e.g. 'billetera/coldcard') or null if key not found
 */
export function getSlug(contentKey: string, locale: SupportedLocale): string | null {
	return SLUG_MAP[contentKey]?.[locale] ?? null;
}

/**
 * Generate hreflang link tags for a given content key + base URL.
 */
export function getHreflangLinks(
	contentKey: string,
	baseUrl: string
): Array<{ lang: string; href: string }> {
	const paths = SLUG_MAP[contentKey];
	if (!paths) return [];
	return [
		{ lang: 'en', href: `${baseUrl}/learn/${paths.en}/` },
		{ lang: 'es', href: `${baseUrl}/aprende/${paths.es}/` },
		{ lang: 'x-default', href: `${baseUrl}/learn/${paths.en}/` }
	];
}

/**
 * Get the locale prefix for a given locale.
 * English uses /learn/, Spanish uses /aprende/.
 */
export function getLocalePrefix(locale: SupportedLocale): string {
	return locale === 'es' ? 'aprende' : 'learn';
}

/**
 * Generate all entries for SvelteKit prerendering.
 * Returns every locale + slug combination.
 */
export function getAllEntries(): Array<{ locale: string; slug: string }> {
	const entries: Array<{ locale: string; slug: string }> = [];
	for (const [, paths] of Object.entries(SLUG_MAP)) {
		for (const loc of SUPPORTED_LOCALES) {
			entries.push({ locale: loc, slug: paths[loc] });
		}
	}
	return entries;
}

/**
 * Generate sitemap URLs for all learn pages.
 */
export function getSitemapUrls(baseUrl: string): Array<{ loc: string; lang: string }> {
	const urls: Array<{ loc: string; lang: string }> = [];
	for (const [, paths] of Object.entries(SLUG_MAP)) {
		urls.push({ loc: `${baseUrl}/learn/${paths.en}/`, lang: 'en' });
		urls.push({ loc: `${baseUrl}/aprende/${paths.es}/`, lang: 'es' });
	}
	return urls;
}

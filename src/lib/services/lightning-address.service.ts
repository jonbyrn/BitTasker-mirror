/**
 * Lightning Address (LUD-16) resolver service.
 *
 * Lightning Addresses follow the format `name@domain.com` and are resolved
 * by fetching the LNURL-pay endpoint at the domain's well-known path.
 *
 * Resolution flow:
 *   1. Split `name@domain` on `@` -> [name, domain]
 *   2. GET `https://{domain}/.well-known/lnurlp/{name}`
 *   3. Response is standard LNURL-pay JSON (same as LUD-06)
 *
 * @see https://github.com/lnurl/luds/blob/luds/16.md
 */

import type { LNURLPayResponse } from './lnurl-pay.service';

// ── TLD list (ICANN active TLDs, shortened to common ones) ───────────────────

// A representative set of valid TLDs for validation. This covers the vast
// majority of Lightning Address deployments in production.
const VALID_TLDS = new Set([
	// Generic TLDs
	'com',
	'org',
	'net',
	'edu',
	'gov',
	'mil',
	'int',
	// Country-code TLDs (all 2-letter ccTLDs)
	'ac',
	'ad',
	'ae',
	'af',
	'ag',
	'ai',
	'al',
	'am',
	'ao',
	'aq',
	'ar',
	'as',
	'at',
	'au',
	'aw',
	'ax',
	'az',
	'ba',
	'bb',
	'bd',
	'be',
	'bf',
	'bg',
	'bh',
	'bi',
	'bj',
	'bm',
	'bn',
	'bo',
	'br',
	'bs',
	'bt',
	'bv',
	'bw',
	'by',
	'bz',
	'ca',
	'cc',
	'cd',
	'cf',
	'cg',
	'ch',
	'ci',
	'ck',
	'cl',
	'cm',
	'cn',
	'co',
	'cr',
	'cu',
	'cv',
	'cw',
	'cx',
	'cy',
	'cz',
	'de',
	'dj',
	'dk',
	'dm',
	'do',
	'dz',
	'ec',
	'ee',
	'eg',
	'er',
	'es',
	'et',
	'eu',
	'fi',
	'fj',
	'fk',
	'fm',
	'fo',
	'fr',
	'ga',
	'gd',
	'ge',
	'gf',
	'gg',
	'gh',
	'gi',
	'gl',
	'gm',
	'gn',
	'gp',
	'gq',
	'gr',
	'gs',
	'gt',
	'gu',
	'gw',
	'gy',
	'hk',
	'hm',
	'hn',
	'hr',
	'ht',
	'hu',
	'id',
	'ie',
	'il',
	'im',
	'in',
	'io',
	'iq',
	'ir',
	'is',
	'it',
	'je',
	'jm',
	'jo',
	'jp',
	'ke',
	'kg',
	'kh',
	'ki',
	'km',
	'kn',
	'kp',
	'kr',
	'kw',
	'ky',
	'kz',
	'la',
	'lb',
	'lc',
	'li',
	'lk',
	'lr',
	'ls',
	'lt',
	'lu',
	'lv',
	'ly',
	'ma',
	'mc',
	'md',
	'me',
	'mg',
	'mh',
	'mk',
	'ml',
	'mm',
	'mn',
	'mo',
	'mp',
	'mq',
	'mr',
	'ms',
	'mt',
	'mu',
	'mv',
	'mw',
	'mx',
	'my',
	'mz',
	'na',
	'nc',
	'ne',
	'nf',
	'ng',
	'ni',
	'nl',
	'no',
	'np',
	'nr',
	'nu',
	'nz',
	'om',
	'pa',
	'pe',
	'pf',
	'pg',
	'ph',
	'pk',
	'pl',
	'pm',
	'pn',
	'pr',
	'ps',
	'pt',
	'pw',
	'py',
	'qa',
	're',
	'ro',
	'rs',
	'ru',
	'rw',
	'sa',
	'sb',
	'sc',
	'sd',
	'se',
	'sg',
	'sh',
	'si',
	'sk',
	'sl',
	'sm',
	'sn',
	'so',
	'sr',
	'ss',
	'st',
	'su',
	'sv',
	'sx',
	'sy',
	'sz',
	'tc',
	'td',
	'tf',
	'tg',
	'th',
	'tj',
	'tk',
	'tl',
	'tm',
	'tn',
	'to',
	'tr',
	'tt',
	'tv',
	'tw',
	'tz',
	'ua',
	'ug',
	'uk',
	'us',
	'uy',
	'uz',
	'va',
	'vc',
	've',
	'vg',
	'vi',
	'vn',
	'vu',
	'wf',
	'ws',
	'ye',
	'yt',
	'za',
	'zm',
	'zw',
	// Popular new gTLDs
	'app',
	'dev',
	'io',
	'ai',
	'co',
	'me',
	'xyz',
	'tech',
	'online',
	'site',
	'live',
	'store',
	'shop',
	'blog',
	'design',
	'pro',
	'info',
	'biz',
	'name',
	'club',
	'world',
	'life',
	'today',
	'cloud',
	'news',
	'media',
	'email',
	'page',
	'tools',
	'network',
	'digital',
	'finance',
	'money',
	'cash',
	'pay',
	'bank',
	'insurance',
	'capital',
	'exchange',
	'invest',
	'markets',
	'cards',
	'accountants',
	'tax',
	'report',
	'management',
	'company',
	'enterprises',
	'llc',
	'ltd',
	'limited',
	'foundation',
	'org',
	'gives',
	'care',
	'charity',
	'sv' // El Salvador (popular for Bitcoin/Lightning)
]);

// ── Compiled regexes ─────────────────────────────────────────────────────────

/**
 * Regex matching a lightning address format: `user@domain.tld`
 *
 * Local part allows: alphanumeric, `.`, `_`, `-`, `+`
 * Domain part allows: alphanumeric, `.`, `-` (standard domain chars)
 * TLD is validated separately against the known TLD list.
 */
const LIGHTNING_ADDRESS_REGEX = /^([a-zA-Z0-9._+=-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the TLD from a domain string.
 * Returns the part after the last `.`
 */
function extractTLD(domain: string): string | null {
	const parts = domain.split('.');
	if (parts.length < 2) return null;
	return parts[parts.length - 1].toLowerCase();
}

/**
 * Validate that a domain has a known valid TLD.
 */
function hasValidTLD(domain: string): boolean {
	const tld = extractTLD(domain);
	if (!tld) return false;

	// All current TLDs are at least 2 characters and contain only letters
	if (tld.length < 2 || !/^[a-z]+$/.test(tld)) return false;

	return VALID_TLDS.has(tld);
}

/**
 * Validate the local part (before @) of a lightning address.
 * Lightning addresses should not look like full email addresses with
 * excessive special characters that are uncommon in lightning deployments.
 */
function isValidLocalPart(localPart: string): boolean {
	if (!localPart || localPart.length > 64) return false;

	// Must not start or end with a special character
	if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
	if (localPart.startsWith('-') || localPart.endsWith('-')) return false;
	if (localPart.startsWith('_') || localPart.endsWith('_')) return false;

	// Must not contain consecutive dots
	if (localPart.includes('..')) return false;

	// Reject local parts that look like email addresses with `.com` embedded
	// e.g., `my.email.com@domain.com` should be treated as suspicious
	const dotSegments = localPart.split('.');
	for (const segment of dotSegments) {
		if (segment === 'com' || segment === 'org' || segment === 'net') {
			return false;
		}
	}

	return true;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check whether a string is a valid Lightning Address (LUD-16) format.
 *
 * Validates:
 *   1. Matches the `name@domain.tld` pattern
 *   2. Domain has a known valid TLD
 *   3. Local part (name) is well-formed
 *
 * This is a purely syntactic check — it does not verify that the address
 * actually exists on the network. Use `resolveLightningAddress` for that.
 *
 * @param value - The string to check
 * @returns `true` if the string matches lightning address format
 *
 * @example
 * ```ts
 * isLightningAddress('alice@getalby.com') // true
 * isLightningAddress('user@blink.sv')     // true
 * isLightningAddress('not-an-address')    // false
 * isLightningAddress('email.com@test.com') // false (`.com` in local part)
 * ```
 */
export function isLightningAddress(value: string): boolean {
	if (!value || typeof value !== 'string') return false;

	const trimmed = value.trim();

	// Must match the basic email-like pattern
	const match = trimmed.match(LIGHTNING_ADDRESS_REGEX);
	if (!match) return false;

	const [, localPart, domain] = match;

	// Validate the domain has a valid TLD
	if (!hasValidTLD(domain)) return false;

	// Validate local part
	if (!isValidLocalPart(localPart)) return false;

	return true;
}

/**
 * Resolve a Lightning Address to its LNURL-pay details.
 *
 * Per LUD-16, the resolution flow is:
 *   1. Split `name@domain` on `@` -> `[name, domain]`
 *   2. GET `https://{domain}/.well-known/lnurlp/{name}`
 *   3. The response is a standard LNURL-pay JSON object
 *
 * @param address - The lightning address (e.g., `alice@getalby.com`)
 * @returns The parsed LNURL-pay response with callback, amounts, and metadata
 * @throws If the address format is invalid or the HTTP request fails
 *
 * @example
 * ```ts
 * const details = await resolveLightningAddress('alice@getalby.com');
 * // details.callback -> 'https://getalby.com/lnurlp/alice/callback'
 * // details.minSendable -> 1000 (msats)
 * // details.maxSendable -> 100000000 (msats)
 * ```
 */
export async function resolveLightningAddress(address: string): Promise<LNURLPayResponse> {
	if (!address || typeof address !== 'string') {
		throw new Error('Invalid lightning address: must be a non-empty string');
	}

	const trimmed = address.trim();

	if (!isLightningAddress(trimmed)) {
		throw new Error(`Invalid lightning address format: '${trimmed}'`);
	}

	// Extract name and domain
	const atIndex = trimmed.indexOf('@');
	const name = trimmed.slice(0, atIndex);
	const domain = trimmed.slice(atIndex + 1);

	// Build the well-known URL per LUD-16
	const wellKnownUrl = `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;

	// Fetch the LNURL-pay endpoint
	const response = await fetch(wellKnownUrl);

	if (!response.ok) {
		throw new Error(
			`Lightning address resolution failed: ${response.status} ${response.statusText}`
		);
	}

	const data = await response.json();

	// Validate response structure per LUD-06 / LUD-16
	if (data.tag !== 'payRequest') {
		throw new Error(`Invalid LNURL tag: expected 'payRequest', got '${data.tag}'`);
	}

	if (!data.callback || typeof data.callback !== 'string') {
		throw new Error('Lightning address response missing callback URL');
	}

	if (typeof data.minSendable !== 'number' || typeof data.maxSendable !== 'number') {
		throw new Error('Lightning address response missing min/max sendable amounts');
	}

	return {
		callback: data.callback,
		maxSendable: data.maxSendable,
		minSendable: data.minSendable,
		metadata: data.metadata || '[]',
		tag: 'payRequest'
	};
}

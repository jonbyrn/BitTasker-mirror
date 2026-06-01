import { browser } from '$app/environment';
import { createDebug } from '$lib/utils/debug';

const d = createDebug('relayUrls');

/** Hostname → default Nostr relay (matches wrangler.toml production/staging/dev). */
const HOSTNAME_GENERAL_RELAY: Record<string, string> = {
	'bittasker.com': 'wss://relay1.bittasker.com',
	'www.bittasker.com': 'wss://relay1.bittasker.com',
	'staging.bittasker.com': 'wss://relay1.bittasker.com',
	'dev.bittasker.com': 'wss://relay1-dev.bittasker.com'
};

/** Hostname → task-specific relay. */
const HOSTNAME_TASK_RELAY: Record<string, string> = {
	'bittasker.com': 'wss://relay2.bittasker.com',
	'www.bittasker.com': 'wss://relay2.bittasker.com',
	'staging.bittasker.com': 'wss://relay2.bittasker.com',
	'dev.bittasker.com': 'wss://relay2-dev.bittasker.com'
};

/**
 * Ensures relay URLs are valid strings:
 * trims whitespace, drops empty/undefined placeholders, normalizes ws(s) scheme.
 */
export function sanitizeRelayUrls(input: string | string[] | undefined): string[] {
	if (!input) return [];

	const rawUrls = Array.isArray(input) ? input : input.split(',');

	return rawUrls
		.map((url) => (typeof url === 'string' ? url.trim() : ''))
		.filter(
			(url) =>
				url.length > 0 &&
				url !== 'undefined' &&
				url !== 'null' &&
				url !== '[object Object]'
		)
		.map((url) => {
			if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
				return `wss://${url}`;
			}
			return url;
		});
}

function relayFallbackForHostname(map: Record<string, string>): string | undefined {
	if (!browser) return undefined;
	const host = window.location.hostname;
	return map[host];
}

/**
 * Resolve general Nostr relay URLs from build-time env, with hostname fallback when
 * VITE_NOSTR_RELAY_URL was not baked into the bundle (e.g. missing CI variable).
 */
export function resolveExplicitRelayUrls(envValue: string | undefined): string[] {
	const fromEnv = sanitizeRelayUrls(envValue);
	if (fromEnv.length > 0) return fromEnv;

	const fallback = relayFallbackForHostname(HOSTNAME_GENERAL_RELAY);
	if (fallback) {
		d.warn(
			'VITE_NOSTR_RELAY_URL missing in bundle; using hostname fallback %s',
			fallback
		);
		return [fallback];
	}

	d.error('No Nostr relay URLs configured (env empty and no hostname fallback)');
	return [];
}

/**
 * Resolve task relay URL from env with hostname fallback.
 */
export function resolveTaskRelayUrls(envValue: string | undefined): string[] {
	const fromEnv = sanitizeRelayUrls(envValue);
	if (fromEnv.length > 0) return fromEnv;

	const fallback = relayFallbackForHostname(HOSTNAME_TASK_RELAY);
	if (fallback) {
		d.warn(
			'VITE_NOSTR_TASK_RELAY_URL missing in bundle; using hostname fallback %s',
			fallback
		);
		return [fallback];
	}

	return resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
}
